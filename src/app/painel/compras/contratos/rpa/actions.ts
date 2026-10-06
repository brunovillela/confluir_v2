"use server"

import { inserirOrdemVerificada } from "@/lib/db/ordens-verificacao"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao, type SessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { esquemaAusente } from "@/lib/db/comum"
import { gerarCodigoProcesso, subirComprovanteCompras } from "@/lib/db/compras"
import { compraNoEscopo, escopoComprasDoUsuario } from "@/lib/db/compras-acesso"
import {
  meiosPagamentoFornecedor,
  type ContaFornecedor,
  type PixFornecedor,
} from "@/lib/db/compras-pagamento"
import { lerDetalhePagamento } from "@/lib/db/compras-pagamento-form"
import {
  AVISO_SQL_RPA_ASSINATURA,
  AVISO_SQL_RPA_COMPRA,
  AVISO_SQL_RPA_CONTRATO,
  buscarRpa,
  compraDoRpa,
  contratoDoRpa,
  obterConfigRpa,
  proximoNumeroRpa,
} from "@/lib/db/compras-rpa"
import { avisarOrdensEmAutorizacao, depoisDaResposta } from "@/lib/db/avisos"
import { registrarEvento, usuarioDaTrilha } from "@/lib/db/ordens-ciclo"
import { lerConfirmacao } from "@/lib/db/ordens-verificacao"
import type { EstadoComApontamentos } from "@/lib/auditoria-confirmacao"
import {
  calcularPorBruto,
  calcularPorLiquido,
  FORMAS_PAGAMENTO_RPA,
  TIPO_ORDEM_RPA,
  type FormaPagamentoRpa,
  type OpcoesRpa,
} from "@/lib/rpa-calculo"
import { createAdminClient } from "@/lib/supabase/admin"
import { podeAcessar } from "@/lib/permissoes"
import { tenantAtual } from "@/lib/tenant"

/**
 * Aquisição › Contratos › RPA — escrita. O RPA nasce de um CONTRATO (exige a
 * edição de contratos) ou de uma COMPRA DE SERVIÇO (vale também quem opera a
 * compra). A lista/consulta usa a de visualização (nas páginas).
 */

const PERMISSOES_COMPRA = ["aquisicoes_compras_edicao", "aquisicoes_comprador", "aquisicoes_compra_direta"]

async function exigirEdicao() {
  return requirePermissao("aquisicoes_contratos_edicao", PERMISSOES_COMPRA)
}

function editaContratos(sessao: SessaoPainel): boolean {
  return podeAcessar(sessao.permissoes, "aquisicoes_contratos_edicao")
}

function txt(fd: FormData, campo: string): string | null {
  const v = String(fd.get(campo) ?? "").trim()
  return v === "" ? null : v
}
function num(fd: FormData, campo: string): number | null {
  const v = txt(fd, campo)
  if (v === null) return null
  const n = Number(v.replace(/\./g, "").replace(",", "."))
  return Number.isFinite(n) ? n : null
}
/** Número decimal "solto" (aceita 8157.41 ou 8.157,41). */
function numSolto(fd: FormData, campo: string): number | null {
  const v = txt(fd, campo)
  if (v === null) return null
  const semMilhar = /,/.test(v) ? v.replace(/\./g, "").replace(",", ".") : v
  const n = Number(semMilhar)
  return Number.isFinite(n) ? n : null
}

/**
 * Chaves Pix e contas do prestador, para o "para onde" da ordem do RPA. Própria
 * do RPA: quem emite (edição de contratos) pode não ter a permissão de compra
 * direta que a busca da aquisição direta exige. O fornecedor precisa ser do
 * tenant (conferido em meiosPagamentoFornecedor).
 */
export async function meiosDoPrestadorRpa(
  fornecedorId: string
): Promise<{ pix: PixFornecedor[]; contas: ContaFornecedor[] }> {
  await exigirEdicao()
  if (!fornecedorId) return { pix: [], contas: [] }
  return meiosPagamentoFornecedor(fornecedorId)
}

/** De onde vêm o prestador e a classificação da despesa da ordem do líquido. */
type OrigemRpa = {
  contratoId: string | null
  fornecedorId: string
  departamentoId: string | null
  centroCustoId: string | null
  /** RPA de compra de serviço: o fornecimento que ele paga. */
  compra?: {
    processoId: string
    fornecimentoId: string
    codigo: string | null
    /** A ordem da compra (com a forma e o "para onde") esperando o recibo. */
    ordemPendenteId: string | null
  }
}

const AGUARDANDO_DOCUMENTO = "Aguardando documento fiscal"

/**
 * RPA de contrato: o prestador é o fornecedor do contrato (pessoa física) e a
 * ordem leva o departamento e o centro de custo dele.
 */
async function origemDoContrato(
  fd: FormData
): Promise<{ origem?: OrigemRpa; erro?: string }> {
  const contrato = await contratoDoRpa(txt(fd, "contrato_id") ?? "")
  if (!contrato) return { erro: "Contrato não encontrado — escolha o contrato de novo." }
  if (!contrato.fornecedorId) {
    return { erro: "O contrato não tem fornecedor. Defina o prestador no contrato antes de emitir o RPA." }
  }
  if (contrato.fornecedorPessoaJuridica) {
    return { erro: "O fornecedor deste contrato é pessoa jurídica — RPA é só para autônomo (pessoa física)." }
  }
  return {
    origem: {
      contratoId: contrato.id,
      fornecedorId: contrato.fornecedorId,
      departamentoId: contrato.departamentoId,
      centroCustoId: contrato.centroCustoId,
    },
  }
}

/**
 * RPA de COMPRA DE SERVIÇO: o prestador é o fornecedor do fornecimento
 * (pessoa física) e a ordem leva o departamento e o centro de custo da
 * compra. Quem opera a compra emite sem precisar da permissão de contratos —
 * desde que a compra esteja no seu escopo de departamentos.
 */
async function origemDaCompra(
  fd: FormData,
  sessao: SessaoPainel
): Promise<{ origem?: OrigemRpa; erro?: string }> {
  const compra = await compraDoRpa(txt(fd, "fornecimento_id") ?? "")
  if (!compra) return { erro: "Compra não encontrada — abra o RPA pela página da compra." }
  if (compra.impedimento) return { erro: compra.impedimento }
  if (
    !podeAcessar(sessao.permissoes, "aquisicoes_comprador") &&
    !podeAcessar(sessao.permissoes, "aquisicoes_contratos_edicao")
  ) {
    const escopo = await escopoComprasDoUsuario(sessao.usuario.id)
    if (!compraNoEscopo(escopo, { departamentoId: compra.departamentoId, solicitanteId: compra.solicitanteId })) {
      return { erro: "Esta compra é de um departamento fora do seu acesso." }
    }
  }
  if (!compra.fornecedorId || !compra.departamentoId || !compra.centroCustoId) {
    return { erro: "A compra está sem departamento ou centro de custo — corrija antes de emitir o RPA." }
  }
  return {
    origem: {
      contratoId: null,
      fornecedorId: compra.fornecedorId,
      departamentoId: compra.departamentoId,
      centroCustoId: compra.centroCustoId,
      compra: {
        processoId: compra.processoId,
        fornecimentoId: compra.fornecimentoId,
        codigo: compra.processoCodigo,
        ordemPendenteId: compra.ordemPendente?.id ?? null,
      },
    },
  }
}

/**
 * Emite o RPA — de um contrato ou de uma compra de serviço — e, junto com o recibo, a ordem de
 * pagamento do valor LÍQUIDO, Em autorização, com a forma de pagamento e o
 * "para onde" completos (chave/conta do prestador, código Pix, boleto ou
 * conta de caixa). Se a ordem falhar, o RPA é desfeito.
 *
 * Dinheiro: só grava a conta de caixa na ordem — o caixa é debitado quando a
 * ordem é paga, não na emissão.
 */
export async function emitirRpa(
  _prev: EstadoComApontamentos,
  fd: FormData
): Promise<EstadoComApontamentos> {
  const sessao = await exigirEdicao()
  const daCompra = txt(fd, "modo") === "compra"
  if (!daCompra && !editaContratos(sessao)) {
    return { erro: "Emitir RPA de contrato exige a permissão de edição de contratos." }
  }
  const { origem, erro: erroOrigem } = daCompra
    ? await origemDaCompra(fd, sessao)
    : await origemDoContrato(fd)
  if (!origem) return { erro: erroOrigem ?? "Dados do RPA inválidos." }

  const descricao = txt(fd, "descricao_servico")
  const base = txt(fd, "base") === "liquido" ? "liquido" : "bruto"
  const valor = num(fd, "valor")
  const pagarEm = txt(fd, "pagar_em")
  const forma = txt(fd, "forma_pagamento")
  // Compra que já tem a ordem: o RPA é só o documento fiscal — o pagamento
  // (forma, "Pagar em", "para onde") é o da compra.
  const ordemDaCompra = origem.compra?.ordemPendenteId ?? null
  if (!descricao) return { erro: "Descreva o serviço prestado." }
  if (valor === null || valor <= 0) return { erro: "Informe o valor (ex.: 1.500,00)." }
  if (!ordemDaCompra) {
    if (!pagarEm || !/^\d{4}-\d{2}-\d{2}$/.test(pagarEm)) {
      return { erro: "Informe a data do pagamento (Pagar em)." }
    }
    if (!forma || !(FORMAS_PAGAMENTO_RPA as readonly string[]).includes(forma)) {
      return { erro: "Escolha a forma de pagamento." }
    }
  }
  const { fornecedorId } = origem

  const cfg = await obterConfigRpa()
  const op: OpcoesRpa = {
    dependentes: Math.max(0, Math.round(numSolto(fd, "dependentes") ?? 0)),
    reterInss: fd.get("reter_inss") === "on",
    reterIrrf: fd.get("reter_irrf") === "on",
    reterIss: fd.get("reter_iss") === "on",
    issAliquota: numSolto(fd, "iss_aliquota") ?? cfg.iss_aliquota_padrao,
  }
  const r =
    base === "liquido"
      ? calcularPorLiquido(valor, cfg, op)
      : calcularPorBruto(valor, cfg, op)
  if (!(r.valorLiquido > 0)) return { erro: "O valor líquido ficou zerado — confira o valor e as retenções." }

  // Por último: chave/conta NOVA do prestador vai para o cadastro dele aqui.
  // Valor 0 na conferência do caixa: ele só é debitado no pagamento da ordem.
  const { detalhe, boleto, erro: erroDetalhe } = ordemDaCompra
    ? {
        detalhe: { cartao_id: null, caixa_conta_id: null, dados_bancarios_id: null, pix_codigo: null, arquivo_boleto: null },
        boleto: undefined,
        erro: undefined,
      }
    : await lerDetalhePagamento(fd, forma as FormaPagamentoRpa, fornecedorId, 0)
  if (erroDetalhe || !detalhe) return { erro: erroDetalhe ?? "Dados de pagamento inválidos." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()

  if (boleto) {
    const up = await subirComprovanteCompras("boletos", boleto)
    if (up.erro || !up.caminho) return { erro: up.erro ?? "Falha ao subir o boleto." }
    detalhe.arquivo_boleto = up.caminho
  }
  const apagarBoleto = async () => {
    if (detalhe.arquivo_boleto) await admin.storage.from("compras").remove([detalhe.arquivo_boleto])
  }

  // até 3 tentativas para o número sequencial (colisão só com emissão simultânea)
  let rpaId: string | null = null
  let rpaNumero: number | null = null
  let ultimoErro = ""
  for (let i = 0; i < 3 && !rpaId; i++) {
    const numero = await proximoNumeroRpa()
    const { data, error } = await admin
      .from("compras_rpa")
      .insert({
        emp_proprietaria_id: emp,
        numero,
        contrato_id: origem.contratoId,
        fornecedor_id: fornecedorId,
        descricao_servico: descricao,
        data_servico: txt(fd, "data_servico"),
        base,
        valor_informado: valor,
        valor_bruto: r.valorBruto,
        inss: r.inss,
        irrf: r.irrf,
        iss: r.iss,
        iss_aliquota: op.reterIss ? op.issAliquota : null,
        dependentes: op.dependentes,
        valor_liquido: r.valorLiquido,
        observacoes: txt(fd, "observacoes"),
        criado_por: sessao.usuario.id,
        ...(origem.compra
          ? { processo_compra_id: origem.compra.processoId, fornecimento_id: origem.compra.fornecimentoId }
          : {}),
      })
      .select("id")
      .single()
    if (data) {
      rpaId = data.id as string
      rpaNumero = numero
    } else {
      if (esquemaAusente(error)) {
        await apagarBoleto()
        return { erro: origem.compra ? AVISO_SQL_RPA_COMPRA : AVISO_SQL_RPA_CONTRATO }
      }
      ultimoErro = error?.message ?? ""
    }
  }
  if (!rpaId) {
    await apagarBoleto()
    return { erro: `Não foi possível emitir: ${ultimoErro}` }
  }

  if (ordemDaCompra && origem.compra) {
    return ligarRpaNaOrdemDaCompra({
      rpaId,
      rpaNumero: rpaNumero!,
      descricao,
      valorLiquido: r.valorLiquido,
      ordemId: ordemDaCompra,
      compra: origem.compra,
    })
  }

  // A ordem do líquido, para o prestador, com a forma e o "para onde". Na
  // compra, o RPA é o documento fiscal: a ordem espera o recibo assinado.
  const { data: ordem, error: erroOrdem } = await inserirOrdemVerificada({
      codigo: gerarCodigoProcesso(),
      tipo: TIPO_ORDEM_RPA,
      descricao: `RPA nº ${rpaNumero} — ${descricao}`,
      situacao: origem.compra ? AGUARDANDO_DOCUMENTO : "Em autorização",
      valor_inicial_cobranca: r.valorLiquido,
      forma_pagamento: forma,
      vencimento: pagarEm,
      beneficiario_fornecedor_id: fornecedorId,
      departamento_id: origem.departamentoId,
      centro_custo_despesa_id: origem.centroCustoId,
      contrato_id: origem.contratoId,
      processo_compra_id: origem.compra?.processoId ?? null,
      ...detalhe,
      excluido: false,
      emp_proprietaria_id: emp,
    }, { confirmacao: lerConfirmacao(fd) })
  // Apontamentos da auditoria: o recibo é desfeito e a tela pergunta.
  if (erroOrdem?.apontamentos) {
    await admin.from("compras_rpa").delete().eq("id", rpaId)
    await apagarBoleto()
    return { apontamentos: erroOrdem.apontamentos }
  }
  const vinculo = ordem
    ? await admin.from("compras_rpa").update({ ordem_pagamento_id: ordem.id }).eq("id", rpaId)
    : null
  // Na compra, a ordem do líquido é a ordem do fornecimento — e o valor da
  // compra passa a ser o líquido do RPA, seja ele de base bruta ou líquida.
  const fornecimento =
    ordem && !vinculo?.error && origem.compra
      ? await admin
          .from("compras_fornecimentos")
          .update({
            ordem_pagamento_id: ordem.id,
            valor: r.valorLiquido,
            forma_pagamento: forma,
            updated_at: new Date().toISOString(),
          })
          .eq("id", origem.compra.fornecimentoId)
          .is("ordem_pagamento_id", null)
          .select("id")
      : null
  const fornecimentoFalhou = fornecimento !== null && Boolean(fornecimento.error || !fornecimento.data?.length)
  if (!ordem || vinculo?.error || fornecimentoFalhou) {
    if (ordem) await admin.from("ordens_pagamento").delete().eq("id", ordem.id)
    await admin.from("compras_rpa").delete().eq("id", rpaId)
    await apagarBoleto()
    const motivo =
      erroOrdem?.message ??
      vinculo?.error?.message ??
      fornecimento?.error?.message ??
      "o fornecimento já recebeu outra ordem — recarregue a compra"
    return { erro: `O RPA não foi emitido: a ordem de pagamento falhou (${motivo}).` }
  }
  await registrarEvento(
    ordem.id,
    "criada",
    await usuarioDaTrilha(),
    `Gerada pelo RPA nº ${rpaNumero}${origem.compra ? ` (da compra ${origem.compra.codigo ?? "de serviço"}) — aguarda o recibo assinado pelo prestador para seguir para autorização` : " (de contrato)"}.`
  )

  if (origem.compra) {
    await alinharValorDaCompra(origem.compra.processoId)
    revalidatePath(`/painel/compras/${origem.compra.processoId}`)
    revalidatePath("/painel/compras")
  }
  revalidatePath("/painel/compras/contratos/rpa")
  if (origem.contratoId) revalidatePath(`/painel/compras/contratos/${origem.contratoId}`)
  redirect(`/painel/compras/contratos/rpa/${rpaId}?salvo=1`)
}

/**
 * Compra que já gerou a ordem (forma e "para onde" da compra): o RPA se liga
 * a ela. A ordem passa a valer o líquido e continua "Aguardando documento
 * fiscal" até o prestador assinar o recibo.
 */
async function ligarRpaNaOrdemDaCompra(p: {
  rpaId: string
  rpaNumero: number
  descricao: string
  valorLiquido: number
  ordemId: string
  compra: NonNullable<OrigemRpa["compra"]>
}): Promise<EstadoComApontamentos> {
  const admin = await createAdminClient()
  const { data: antes } = await admin
    .from("ordens_pagamento")
    .select("valor_inicial_cobranca, tipo, descricao")
    .eq("id", p.ordemId)
    .maybeSingle()
  const { data: ligada, error } = await admin
    .from("ordens_pagamento")
    .update({
      tipo: TIPO_ORDEM_RPA,
      descricao: `RPA nº ${p.rpaNumero} — ${p.descricao}`,
      valor_inicial_cobranca: p.valorLiquido,
    })
    .eq("id", p.ordemId)
    .eq("situacao", AGUARDANDO_DOCUMENTO)
    .select("id")
  const vinculo = ligada?.length
    ? await admin.from("compras_rpa").update({ ordem_pagamento_id: p.ordemId }).eq("id", p.rpaId)
    : null
  if (error || !ligada?.length || vinculo?.error) {
    if (ligada?.length && antes) {
      await admin
        .from("ordens_pagamento")
        .update({ tipo: antes.tipo, descricao: antes.descricao, valor_inicial_cobranca: antes.valor_inicial_cobranca })
        .eq("id", p.ordemId)
    }
    await admin.from("compras_rpa").delete().eq("id", p.rpaId)
    return {
      erro: `O RPA não foi emitido: ${error?.message ?? vinculo?.error?.message ?? "a ordem da compra mudou de situação — recarregue a compra"}.`,
    }
  }
  await admin
    .from("compras_fornecimentos")
    .update({ valor: p.valorLiquido, updated_at: new Date().toISOString() })
    .eq("id", p.compra.fornecimentoId)
  const valorAntes = antes?.valor_inicial_cobranca == null ? null : Number(antes.valor_inicial_cobranca)
  await registrarEvento(
    p.ordemId,
    "corrigida",
    await usuarioDaTrilha(),
    `RPA nº ${p.rpaNumero} emitido para esta compra — é o documento fiscal; a ordem aguarda o recibo assinado pelo prestador para seguir para autorização.`,
    valorAntes !== null && Math.abs(valorAntes - p.valorLiquido) >= 0.005
      ? { antes: { valor_inicial_cobranca: valorAntes }, depois: { valor_inicial_cobranca: p.valorLiquido } }
      : { rpa_id: p.rpaId }
  )
  await alinharValorDaCompra(p.compra.processoId)
  revalidatePath(`/painel/compras/${p.compra.processoId}`)
  revalidatePath("/painel/compras")
  revalidatePath("/painel/compras/contratos/rpa")
  revalidatePath(`/painel/financeiro/ordens/${p.ordemId}`)
  redirect(`/painel/compras/contratos/rpa/${p.rpaId}?salvo=1`)
}

/** O valor da compra é a soma dos fornecimentos — o do RPA virou o líquido. */
async function alinharValorDaCompra(processoId: string) {
  const admin = await createAdminClient()
  const { data } = await admin.from("compras_fornecimentos").select("valor").eq("processo_id", processoId)
  const total = (data ?? []).reduce((soma, f) => soma + (Number(f.valor) || 0), 0)
  await admin
    .from("compras_solicitacoes")
    .update({ compra_valor: Math.round(total * 100) / 100 })
    .eq("id", processoId)
}

/**
 * Exclui o RPA que ainda NÃO tem o recibo assinado anexado — assinado, ele é
 * comprovante fiscal e fica. A ordem do líquido vai junto, mas só enquanto
 * ninguém a autorizou; depois, o Financeiro precisa cancelá-la antes.
 */
export async function excluirRpa(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigirEdicao()
  const id = txt(fd, "id")
  if (!id) return { erro: "RPA inválido." }
  const rpa = await buscarRpa(id)
  if (!rpa) return { erro: "RPA não encontrado." }
  if (rpa.arquivoAssinado) {
    return {
      erro: "Este RPA já tem o recibo assinado pelo prestador — é comprovante fiscal e não pode ser excluído.",
    }
  }
  // RPA de compra com a ordem esperando o recibo: a ordem é da compra e fica
  // (volta a esperar um RPA); só o recibo sai.
  if (rpa.ordemId && rpa.fornecimentoId && rpa.ordemSituacao === AGUARDANDO_DOCUMENTO) {
    const admin = await createAdminClient()
    const emp = await tenantAtual()
    await admin
      .from("ordens_pagamento")
      .update({ tipo: "Compras", descricao: `Compra de serviço — aguarda o RPA do prestador (o RPA nº ${rpa.numero ?? "—"} foi excluído)` })
      .eq("id", rpa.ordemId)
      .eq("situacao", AGUARDANDO_DOCUMENTO)
    const { error } = await admin.from("compras_rpa").delete().eq("id", id).eq("emp_proprietaria_id", emp)
    if (error) return { erro: `Não foi possível excluir: ${error.message}` }
    await registrarEvento(rpa.ordemId, "corrigida", await usuarioDaTrilha(), `RPA nº ${rpa.numero ?? "—"} excluído — a ordem segue aguardando o documento fiscal (um novo RPA).`)
    revalidatePath("/painel/compras/contratos/rpa")
    if (rpa.compraId) {
      revalidatePath(`/painel/compras/${rpa.compraId}`)
      if (txt(fd, "voltar") !== "lista") redirect(`/painel/compras/${rpa.compraId}?salvo=1`)
    }
    redirect("/painel/compras/contratos/rpa?excluido=1")
  }
  if (rpa.ordemId && rpa.ordemSituacao !== "Em autorização") {
    return {
      erro: `A ordem de pagamento deste RPA já está "${rpa.ordemSituacao}" — peça ao Financeiro para cancelá-la antes de excluir o RPA.`,
    }
  }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  // RPA de compra: o fornecimento volta a ficar sem ordem (à espera de um
  // novo RPA ou da ordem comum) — solto antes, porque ele referencia a ordem.
  const soltarFornecimento = rpa.ordemId && rpa.fornecimentoId
  if (soltarFornecimento) {
    await admin
      .from("compras_fornecimentos")
      .update({ ordem_pagamento_id: null, updated_at: new Date().toISOString() })
      .eq("id", rpa.fornecimentoId!)
      .eq("ordem_pagamento_id", rpa.ordemId!)
  }
  // A ordem primeiro, e só se continua Em autorização (alguém pode tê-la
  // autorizado agora): assim não sobra ordem órfã de RPA apagado.
  if (rpa.ordemId) {
    const { data: apagadas, error: erroOrdem } = await admin
      .from("ordens_pagamento")
      .delete()
      .eq("id", rpa.ordemId)
      .eq("emp_proprietaria_id", emp)
      .eq("situacao", "Em autorização")
      .select("id")
    if ((erroOrdem || !apagadas?.length) && soltarFornecimento) {
      await admin
        .from("compras_fornecimentos")
        .update({ ordem_pagamento_id: rpa.ordemId })
        .eq("id", rpa.fornecimentoId!)
        .is("ordem_pagamento_id", null)
    }
    if (erroOrdem) return { erro: `Não foi possível excluir a ordem do RPA: ${erroOrdem.message}` }
    if (!apagadas?.length) {
      return { erro: "A ordem de pagamento deste RPA mudou de situação — recarregue a página." }
    }
  }
  const { error } = await admin
    .from("compras_rpa")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  revalidatePath("/painel/compras/contratos/rpa")
  if (rpa.compraId) {
    revalidatePath(`/painel/compras/${rpa.compraId}`)
    if (txt(fd, "voltar") !== "lista") redirect(`/painel/compras/${rpa.compraId}?salvo=1`)
  }
  if (rpa.contratoId) {
    revalidatePath(`/painel/compras/contratos/${rpa.contratoId}`)
    if (txt(fd, "voltar") !== "lista") {
      redirect(`/painel/compras/contratos/${rpa.contratoId}?rpaExcluido=1`)
    }
  }
  redirect("/painel/compras/contratos/rpa?excluido=1")
}

/**
 * Anexa o recibo assinado pelo prestador (PDF ou foto). Com ele, o RPA vira
 * comprovante fiscal e não pode mais ser excluído; anexar de novo substitui o
 * arquivo (ex.: digitalização ilegível).
 */
export async function anexarRpaAssinado(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await exigirEdicao()
  const id = txt(fd, "id")
  const rpa = id ? await buscarRpa(id) : null
  if (!id || !rpa) return { erro: "RPA não encontrado." }
  const arquivo = fd.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Escolha o arquivo do recibo assinado (PDF ou foto)." }
  }
  const up = await subirComprovanteCompras(`rpa-assinados/${id}`, arquivo)
  if (up.erro || !up.caminho) return { erro: up.erro ?? "Falha ao subir o arquivo." }

  const admin = await createAdminClient()
  const { error } = await admin
    .from("compras_rpa")
    .update({
      arquivo_assinado: up.caminho,
      assinado_em: new Date().toISOString(),
      assinado_por_id: sessao.usuario.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) {
    await admin.storage.from("compras").remove([up.caminho])
    if (esquemaAusente(error)) return { erro: AVISO_SQL_RPA_ASSINATURA }
    return { erro: `Não foi possível anexar: ${error.message}` }
  }
  // O anterior (substituído) sai do bucket.
  if (rpa.arquivoAssinado && !/^(https?:)?\/\//.test(rpa.arquivoAssinado)) {
    await admin.storage.from("compras").remove([rpa.arquivoAssinado])
  }
  // Na compra, o recibo assinado é o documento fiscal: entra como a nota do
  // fornecimento e da ordem, onde estiver vazia ou for o recibo anterior.
  if (rpa.fornecimentoId) {
    const anterior = rpa.arquivoAssinado
    const alvos = [
      { tabela: "compras_fornecimentos", coluna: "nota_fiscal_url", id: rpa.fornecimentoId },
      { tabela: "ordens_pagamento", coluna: "arquivo_nota_fiscal", id: rpa.ordemId },
    ]
    for (const a of alvos) {
      if (!a.id) continue
      await admin
        .from(a.tabela)
        .update({ [a.coluna]: up.caminho })
        .eq("id", a.id)
        .or(anterior ? `${a.coluna}.is.null,${a.coluna}.eq."${anterior}"` : `${a.coluna}.is.null`)
    }
    if (rpa.compraId) revalidatePath(`/painel/compras/${rpa.compraId}`)
  }
  // RPA de compra: o recibo assinado é o documento fiscal que a ordem
  // esperava — ela segue para autorização.
  let seguiu = false
  if (rpa.ordemId && rpa.ordemSituacao === AGUARDANDO_DOCUMENTO) {
    const { data: movida } = await admin
      .from("ordens_pagamento")
      .update({ situacao: "Em autorização", arquivo_nota_fiscal: up.caminho })
      .eq("id", rpa.ordemId)
      .eq("situacao", AGUARDANDO_DOCUMENTO)
      .select("id")
    if (movida?.length) {
      seguiu = true
      await registrarEvento(
        rpa.ordemId,
        "documento_fiscal",
        sessao.usuario.id,
        `Recibo do RPA nº ${rpa.numero ?? "—"} assinado pelo prestador — seguiu para autorização.`,
        { arquivo_nota_fiscal: up.caminho }
      )
      depoisDaResposta(() => avisarOrdensEmAutorizacao([rpa.ordemId!]))
      revalidatePath(`/painel/financeiro/ordens/${rpa.ordemId}`)
      revalidatePath("/painel/compras/avaliacoes")
    }
  }
  revalidatePath(`/painel/compras/contratos/rpa/${id}`)
  revalidatePath("/painel/compras/contratos/rpa")
  if (rpa.contratoId) revalidatePath(`/painel/compras/contratos/${rpa.contratoId}`)
  return {
    ok: rpa.arquivoAssinado
      ? "Recibo assinado substituído."
      : seguiu
        ? "Recibo assinado anexado — a ordem de pagamento seguiu para autorização. O RPA não pode mais ser excluído."
        : "Recibo assinado anexado — o RPA não pode mais ser excluído.",
  }
}

export async function salvarConfigRpa(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigirEdicao()
  const faixas: { ate: number | null; aliquota: number; deduzir: number }[] = []
  for (let i = 0; i < 5; i++) {
    const aliquota = numSolto(fd, `faixa_aliquota_${i}`)
    if (aliquota === null) continue
    const ate = i === 4 ? null : numSolto(fd, `faixa_ate_${i}`)
    if (i < 4 && ate === null) continue
    faixas.push({
      ate,
      aliquota,
      deduzir: numSolto(fd, `faixa_deduzir_${i}`) ?? 0,
    })
  }
  if (faixas.length === 0) return { erro: "Informe a tabela do IRRF." }
  const admin = await createAdminClient()
  const { error } = await admin.from("compras_rpa_config").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      inss_aliquota: numSolto(fd, "inss_aliquota") ?? 11,
      inss_teto: numSolto(fd, "inss_teto") ?? 0,
      irrf_faixas: faixas,
      irrf_deducao_dependente: numSolto(fd, "irrf_deducao_dependente") ?? 0,
      iss_aliquota_padrao: numSolto(fd, "iss_aliquota_padrao") ?? 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id" }
  )
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  revalidatePath("/painel/compras/contratos/rpa")
  return { ok: "Tabelas de retenção salvas — valem para os próximos RPAs." }
}
