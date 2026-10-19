import "server-only"

import type { Apontamento } from "@/lib/auditoria-confirmacao"
import { DETALHE_DA_FORMA, FORMA_PAGA_NO_ATO, type FormaPagamentoCompras } from "@/lib/compras-constantes"
import { buscarProcesso, subirComprovanteCompras, type ProcessoDetalhe } from "@/lib/db/compras"
import type { DetalhePagamento } from "@/lib/db/compras-pagamento"
import { rpasDosFornecimentos } from "@/lib/db/compras-rpa"
import {
  caixaJaDebitado,
  registrarEvento,
  reenviarParaAutorizacao,
  SITUACAO_AGUARDANDO,
  SITUACAO_AGUARDANDO_DOCUMENTO,
  SITUACAO_EM_AUTORIZACAO,
} from "@/lib/db/ordens-ciclo"
import { reverificarOrdem, type Confirmacao } from "@/lib/db/ordens-verificacao"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * EDITAR A COMPRA (15/10/2026). Enquanto nenhuma ordem da compra foi
 * autorizada, a compra está nas mãos de quem a registrou: tudo pode mudar —
 * descrição, tipo, departamento, centro de custo, projeto, entrega e, na
 * compra de um só pagamento, fornecedor, valor, data, comprador, forma,
 * "Pagar em" e nota. A auditoria (regras + IA) reanalisa as ordens como vão
 * ficar ANTES de gravar, com a mesma tela de confirmação do registro; os
 * alertas passam a ser os da compra editada. Autorizada, a correção é com o
 * Financeiro.
 */

/** Situações em que a ordem ainda não saiu das mãos de quem comprou. */
export const SITUACOES_DE_QUEM_COMPROU = [
  SITUACAO_EM_AUTORIZACAO,
  SITUACAO_AGUARDANDO_DOCUMENTO,
  SITUACAO_AGUARDANDO,
]

export type EdicaoCompra = {
  pode: boolean
  /** Por que não pode (ou o que fica travado). */
  motivo: string | null
  /** Um fornecimento com um pagamento: fornecedor, valor, forma e nota também. */
  completa: boolean
  fornecimentoId: string | null
  ordemId: string | null
  /** Paga por RPA: o valor é o líquido do recibo e o prestador é o do RPA. */
  porRpa: boolean
  /** Dinheiro já saiu do caixa: valor e forma ficam. */
  caixaDebitado: boolean
  fornecedorEditavel: boolean
}

function ordensDoProcesso(p: ProcessoDetalhe) {
  const todas = [...(p.fornecimentos ?? []).flatMap((f) => f.pagamentos), ...p.ordensAvulsas]
  return todas.filter((o, i) => todas.findIndex((x) => x.id === o.id) === i && o.situacao !== "Cancelada")
}

export async function edicaoDaCompra(p: ProcessoDetalhe): Promise<EdicaoCompra> {
  const nao = (motivo: string): EdicaoCompra => ({
    pode: false,
    motivo,
    completa: false,
    fornecimentoId: null,
    ordemId: null,
    porRpa: false,
    caixaDebitado: false,
    fornecedorEditavel: false,
  })
  if (p.cancelado) return nao("Processo cancelado.")
  const ordens = ordensDoProcesso(p)
  const fora = ordens.find((o) => o.autorizado || !SITUACOES_DE_QUEM_COMPROU.includes(String(o.situacao)))
  if (fora) {
    return nao(
      `A ordem ${fora.codigo ?? ""} já está "${fora.situacao}" — a compra saiu das mãos de quem a registrou. Correções agora são com o Financeiro.`
    )
  }
  const fornecimentos = p.fornecimentos ?? []
  const unico = fornecimentos.length === 1 && fornecimentos[0].pagamentos.length === 1 && p.ordensAvulsas.length === 0
  if (!unico) {
    return {
      pode: true,
      motivo: ordens.length
        ? "Compra com mais de um fornecimento ou pagamento: aqui se editam os dados da solicitação; valor e forma de cada pagamento, o Financeiro corrige na ordem."
        : null,
      completa: false,
      fornecimentoId: null,
      ordemId: null,
      porRpa: false,
      caixaDebitado: false,
      fornecedorEditavel: false,
    }
  }
  const f = fornecimentos[0]
  const ordemId = f.pagamentos[0].id
  const [rpas, caixa] = await Promise.all([rpasDosFornecimentos([f.id]), caixaJaDebitado(ordemId)])
  const porRpa = rpas.has(f.id)
  return {
    pode: true,
    motivo: porRpa
      ? "Paga por RPA: o valor é o líquido do recibo e o prestador é o do RPA — para mudá-los, exclua o RPA e emita outro."
      : caixa
        ? "Paga em dinheiro: o valor já saiu do caixa — valor e forma não mudam aqui (cancele e lance de novo)."
        : null,
    completa: true,
    fornecimentoId: f.id,
    ordemId,
    porRpa,
    caixaDebitado: caixa,
    fornecedorEditavel: p.aquisicao_direta === true && !porRpa,
  }
}

export type DadosEdicaoCompra = {
  produto: string
  e_produto: boolean
  observacao: string | null
  departamento_id: string
  centro_custo_id: string
  projeto_id: string | null
  entrega_no_ato: boolean
  data_limite: string | null
  local_entrega: string | null
  /** Só na compra de um pagamento. */
  compra?: {
    fornecedor_id: string
    valor: number
    data_compra: string
    comprador_id: string | null
    vencimento: string | null
    /** Forma e "com o quê" novos (null = mantém os da ordem). */
    pagamento: { forma: string; detalhe: DetalhePagamento; boleto?: File } | null
    /** Nota nova (substitui a da compra). */
    nota: File | null
  }
}

type Linha = Record<string, unknown>

const igual = (a: unknown, b: unknown) => String(a ?? "") === String(b ?? "")

/** Troca o texto antigo do produto pelo novo na descrição da ordem. */
function novaDescricao(atual: string | null, produtoAntes: string | null, produto: string): string | null {
  if (!atual || !produtoAntes || produtoAntes === produto) return atual
  return atual.includes(produtoAntes) ? atual.replace(produtoAntes, produto) : atual
}

export async function editarCompra(
  processoId: string,
  dados: DadosEdicaoCompra,
  usuarioId: string,
  confirmacao: Confirmacao
): Promise<{ erro?: string; apontamentos?: Apontamento[] }> {
  const p = await buscarProcesso(processoId)
  if (!p) return { erro: "Processo não encontrado." }
  const ed = await edicaoDaCompra(p)
  if (!ed.pode) return { erro: ed.motivo ?? "Esta compra não pode mais ser editada." }
  if (dados.compra && !ed.completa) return { erro: "Esta compra tem mais de um pagamento — edite só a solicitação." }

  const admin = await createAdminClient()
  const ordens = ordensDoProcesso(p)
  const { data: brutas } = ordens.length
    ? await admin.from("ordens_pagamento").select("*").in("id", ordens.map((o) => o.id))
    : { data: [] as Linha[] }
  const ordemPorId = new Map(((brutas ?? []) as Linha[]).map((o) => [String(o.id), o]))

  // ── O que muda em cada ordem ────────────────────────────────────────────
  const mudancasPorOrdem = new Map<string, Linha>()
  for (const o of ordens) {
    const atual = ordemPorId.get(o.id) ?? {}
    mudancasPorOrdem.set(o.id, {
      descricao: novaDescricao((atual.descricao as string | null) ?? null, p.produto, dados.produto),
      departamento_id: dados.departamento_id,
      centro_custo_despesa_id: dados.centro_custo_id,
    })
  }

  const c = dados.compra
  const f = ed.completa ? (p.fornecimentos ?? [])[0] : null
  const ordemUnica = ed.ordemId ? (ordemPorId.get(ed.ordemId) ?? null) : null
  if (c && f && ed.ordemId && ordemUnica) {
    const fornecedorId = ed.fornecedorEditavel ? c.fornecedor_id : (f.fornecedor_id ?? c.fornecedor_id)
    const valor = ed.porRpa || ed.caixaDebitado ? Number(ordemUnica.valor_inicial_cobranca ?? f.valor ?? 0) : c.valor
    const forma = c.pagamento && !ed.caixaDebitado ? c.pagamento.forma : ((ordemUnica.forma_pagamento as string | null) ?? null)
    if (
      fornecedorId !== f.fornecedor_id &&
      !c.pagamento &&
      (ordemUnica.dados_bancarios_id ||
        ["pix_fornecedor", "conta_fornecedor"].includes(DETALHE_DA_FORMA[forma as FormaPagamentoCompras] ?? ""))
    ) {
      return { erro: "Com outro fornecedor, informe de novo a forma e a chave/conta do pagamento (marque “Alterar a forma de pagamento”)." }
    }
    const vencimento = forma === FORMA_PAGA_NO_ATO && !ed.porRpa ? c.data_compra : c.vencimento
    if (!vencimento) return { erro: "Informe a data de pagamento (Pagar em)." }
    const notaDaOrdemEhDaCompra =
      !ordemUnica.arquivo_nota_fiscal || ordemUnica.arquivo_nota_fiscal === f.nota_fiscal_url
    Object.assign(mudancasPorOrdem.get(ed.ordemId)!, {
      beneficiario_fornecedor_id: fornecedorId,
      valor_inicial_cobranca: valor,
      vencimento,
      ...(c.pagamento && !ed.caixaDebitado
        ? { forma_pagamento: c.pagamento.forma, ...c.pagamento.detalhe, ...(c.pagamento.boleto ? { arquivo_boleto: "(novo boleto)" } : {}) }
        : {}),
      // Trocou o cartão (ou saiu do cartão): sai da fatura; volta à do cartão novo ao gravar.
      ...(c.pagamento && !ed.caixaDebitado && (c.pagamento.detalhe.cartao_id ?? null) !== ((ordemUnica.cartao_id as string | null) ?? null)
        ? { cartao_fatura_id: null }
        : {}),
      // A análise só confere se há nota; o arquivo sobe depois dela.
      ...(c.nota && notaDaOrdemEhDaCompra ? { arquivo_nota_fiscal: "(nova nota)" } : {}),
    })
  }

  // ── Auditoria antes de gravar (mesma tela de confirmação do registro) ───
  const analises: { ordemId: string; registrar: (motivo: string) => Promise<void> }[] = []
  const apontamentos = new Map<string, Apontamento>()
  // Os pagamentos da compra têm a mesma descrição-base: a IA a avalia uma vez.
  const memoIA: Parameters<typeof reverificarOrdem>[3] = new Map()
  for (const [ordemId, mudancas] of mudancasPorOrdem) {
    const r = await reverificarOrdem(ordemId, mudancas, { confirmacao }, memoIA)
    r.apontamentos?.forEach((a) => apontamentos.set(a.codigo, a))
    analises.push({ ordemId, registrar: r.registrar })
  }
  if (apontamentos.size) return { apontamentos: [...apontamentos.values()] }

  // ── Arquivos (só depois da análise) ─────────────────────────────────────
  let notaNova: string | null = null
  if (c?.nota) {
    const r = await subirComprovanteCompras("notas", c.nota)
    if (r.erro || !r.caminho) return { erro: r.erro ?? "Falha ao subir a nota." }
    notaNova = r.caminho
  }
  if (c?.pagamento?.boleto) {
    const r = await subirComprovanteCompras("boletos", c.pagamento.boleto)
    if (r.erro || !r.caminho) return { erro: r.erro ?? "Falha ao subir o boleto." }
    c.pagamento.detalhe.arquivo_boleto = r.caminho
  }
  for (const m of mudancasPorOrdem.values()) {
    if (m.arquivo_nota_fiscal === "(nova nota)") m.arquivo_nota_fiscal = notaNova
    if (m.arquivo_boleto === "(novo boleto)") m.arquivo_boleto = c?.pagamento?.detalhe.arquivo_boleto ?? null
  }

  // ── Gravação ────────────────────────────────────────────────────────────
  const emp = await tenantAtual()
  const processo: Linha = {
    solicitacao_produto: dados.produto,
    solicitacao_e_produto: dados.e_produto,
    solicitacao_observacao: dados.observacao,
    solicitacao_departamento_id: dados.departamento_id,
    solicitacao_centro_custo_id: dados.centro_custo_id,
    solicitacao_projeto_id: dados.projeto_id,
    solicitacao_data_limite: dados.entrega_no_ato ? null : dados.data_limite,
    solicitacao_local: dados.entrega_no_ato ? null : dados.local_entrega,
    solicitacao_entrega_no_ato: dados.entrega_no_ato,
  }
  if (c && f && ed.ordemId) {
    const m = mudancasPorOrdem.get(ed.ordemId)!
    if (p.aquisicao_direta) {
      Object.assign(processo, {
        compra_data: c.data_compra,
        compra_valor: m.valor_inicial_cobranca,
        compra_fornecedor_id: m.beneficiario_fornecedor_id,
        ...(c.comprador_id ? { comprado_por_id: c.comprador_id } : {}),
        ...(notaNova ? { comprovante_url: notaNova } : {}),
      })
    }
    const { error: erroF } = await admin
      .from("compras_fornecimentos")
      .update({
        fornecedor_id: m.beneficiario_fornecedor_id,
        valor: m.valor_inicial_cobranca,
        data_compra: c.data_compra,
        ...(c.comprador_id ? { comprador_id: c.comprador_id } : {}),
        ...("forma_pagamento" in m ? { forma_pagamento: m.forma_pagamento } : {}),
        ...(notaNova ? { nota_fiscal_url: notaNova } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", f.id)
    if (erroF) return { erro: `Não foi possível salvar a compra: ${erroF.message}` }
  }
  const { error: erroP } = await admin
    .from("compras_solicitacoes")
    .update(processo)
    .eq("id", processoId)
    .eq("emp_proprietaria_id", emp)
  if (erroP) return { erro: `Não foi possível salvar a solicitação: ${erroP.message}` }

  for (const { ordemId, registrar } of analises) {
    const atual = ordemPorId.get(ordemId) ?? {}
    const mudancas = mudancasPorOrdem.get(ordemId)!
    const antes: Linha = {}
    const depois: Linha = {}
    for (const [k, v] of Object.entries(mudancas)) {
      if (igual(atual[k], v)) continue
      antes[k] = atual[k] ?? null
      depois[k] = v ?? null
    }
    if (Object.keys(depois).length) {
      // A situação no filtro: se a ordem foi autorizada enquanto se editava, não muda.
      const { data: gravada, error } = await admin
        .from("ordens_pagamento")
        .update(depois)
        .eq("id", ordemId)
        .in("situacao", SITUACOES_DE_QUEM_COMPROU)
        .not("autorizacao_esta_autorizado", "is", true)
        .select("id")
      if (error) return { erro: `Não foi possível salvar a ordem: ${error.message}` }
      if (!gravada?.length) return { erro: "A ordem foi autorizada enquanto você editava — recarregue a página." }
    }
    await registrarEvento(
      ordemId,
      "corrigida",
      usuarioId,
      Object.keys(depois).length
        ? "Compra editada antes da autorização."
        : "Compra editada antes da autorização (sem mudança nesta ordem).",
      { antes, depois, reavaliada: true }
    )
    await registrar("refeitas na edição da compra")
    // Devolvida para informações: a edição é a resposta — volta para a fila.
    if (atual.situacao === SITUACAO_AGUARDANDO) {
      await reenviarParaAutorizacao(ordemId, usuarioId, "Compra editada por quem a registrou.")
    }
  }
  // Forma mudou para cartão de crédito: a ordem entra na fatura aberta dele.
  if (ed.ordemId) {
    const { vincularOrdensAoCartao } = await import("@/lib/db/cartao-faturas")
    await vincularOrdensAoCartao([ed.ordemId]).catch((e) => console.error("vincularOrdensAoCartao:", e))
  }
  return {}
}
