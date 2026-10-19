import "server-only"

import { rotuloCentroCusto } from "@/lib/centros-custo-rotulo"
import { esquemaAusente, hojeSP, texto } from "@/lib/db/comum"
import { gerarCodigoProcesso, subirComprovanteCompras } from "@/lib/db/compras"
import { nomeCartao } from "@/lib/db/compras-pagamento"
import {
  registrarEvento,
  SITUACAO_A_PAGAR,
  SITUACAO_EM_AUTORIZACAO,
  usuarioDaTrilha,
} from "@/lib/db/ordens-ciclo"
import { inserirOrdemVerificada } from "@/lib/db/ordens-verificacao"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { SITUACAO_NA_FATURA, TIPO_ORDEM_FATURA_CARTAO } from "@/lib/ordens-situacoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * FATURAS DO CARTÃO DE CRÉDITO (19/10/2026, migração cartao_faturas).
 *
 * Como o Caixa, mas segregado em faturas — a lógica das remessas de diárias:
 * toda ordem paga com um cartão de crédito entra na fatura ABERTA dele
 * (`ordens_pagamento.cartao_fatura_id`). Ela segue a alçada normal, mas,
 * autorizada, fica "Na fatura" em vez de "A pagar": não é paga sozinha e sai
 * das somas de despesa. No FECHAMENTO o Financeiro informa o valor da fatura,
 * sobe o arquivo e gera UMA ordem, rateada pelos centros de custo das compras;
 * a diferença (juros, IOF, anuidade, estorno) vai para um centro escolhido ali.
 */

const ROUND = (v: number) => Math.round(v * 100) / 100
/** Ordens que não pesam na fatura. */
const FORA_DA_FATURA = ["Cancelada", "Estornado"]

export type FaturaResumo = {
  id: string
  cartaoId: string
  numero: number
  situacao: "aberta" | "fechada"
  abertaEm: string
  fechadaEm: string | null
  valorFatura: number | null
  vencimento: string | null
  ordemId: string | null
  ordemCodigo: string | null
  ordemSituacao: string | null
  compras: number
  soma: number
}

export type ItemFatura = {
  id: string
  codigo: string | null
  descricao: string | null
  situacao: string
  valor: number
  data: string | null
  favorecido: string | null
  centroId: string | null
  centro: string | null
  departamentoId: string | null
  /** Rateio próprio da compra, quando ela tem. */
  rateio: { centroId: string | null; centro: string | null; departamentoId: string | null; valor: number }[]
  conta: boolean
}

export type LinhaRateioFatura = {
  centroId: string | null
  centro: string | null
  departamentoId: string | null
  valor: number
  descricao: string
}

// ── Fatura aberta e vínculo das ordens ──────────────────────────────────────

/** Cartão de crédito do tenant (null para débito/pré-pago ou inexistente). */
async function cartaoDeCredito(cartaoId: string) {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("cartoes")
    .select("id, apelido, bandeira, final, tipo")
    .eq("id", cartaoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return data && data.tipo === "credito" ? data : null
}

/** A fatura aberta do cartão — cria a próxima quando não há (null sem o SQL). */
export async function garantirFaturaAberta(cartaoId: string): Promise<string | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    const { data: aberta, error } = await admin
      .from("financeiro_cartao_faturas")
      .select("id")
      .eq("cartao_id", cartaoId)
      .eq("emp_proprietaria_id", emp)
      .eq("situacao", "aberta")
      .maybeSingle()
    if (error) {
      if (!esquemaAusente(error)) console.error("garantirFaturaAberta:", error.message)
      return null
    }
    if (aberta) return String(aberta.id)
    const { data: ultima } = await admin
      .from("financeiro_cartao_faturas")
      .select("numero")
      .eq("cartao_id", cartaoId)
      .order("numero", { ascending: false })
      .limit(1)
    const numero = Number(ultima?.[0]?.numero ?? 0) + 1
    const { data: nova, error: erroNova } = await admin
      .from("financeiro_cartao_faturas")
      .insert({ emp_proprietaria_id: emp, cartao_id: cartaoId, numero })
      .select("id")
      .single()
    if (nova) return String(nova.id)
    // Outra requisição abriu ao mesmo tempo (índice de uma aberta por cartão): relê.
    if (erroNova && erroNova.code !== "23505") {
      console.error("garantirFaturaAberta:", erroNova.message)
      return null
    }
  }
  return null
}

/**
 * Liga à fatura aberta as ordens pagas com cartão de crédito que ainda não
 * estão em fatura; as já autorizadas ("A pagar") passam a "Na fatura".
 * Chamado na criação de ordens (inserirOrdensVerificadas) e quando a forma
 * de uma ordem muda para cartão. Sem o SQL, não faz nada.
 */
export async function vincularOrdensAoCartao(ordemIds: string[]): Promise<void> {
  if (!ordemIds.length) return
  const admin = await createAdminClient()
  const { data: ordens, error } = await admin
    .from("ordens_pagamento")
    .select("id, situacao, cartao_id, cartao_fatura_id")
    .in("id", ordemIds)
    .not("cartao_id", "is", null)
    .is("cartao_fatura_id", null)
  if (error || !ordens?.length) return
  const usuario = await usuarioDaTrilha()
  for (const o of ordens) {
    const cartao = await cartaoDeCredito(String(o.cartao_id))
    if (!cartao) continue
    const faturaId = await garantirFaturaAberta(String(cartao.id))
    if (!faturaId) continue
    const naFatura = o.situacao === SITUACAO_A_PAGAR
    const { error: erroLiga } = await admin
      .from("ordens_pagamento")
      .update({ cartao_fatura_id: faturaId, ...(naFatura ? { situacao: SITUACAO_NA_FATURA } : {}) })
      .eq("id", o.id)
      .is("cartao_fatura_id", null)
    if (erroLiga) {
      console.error("vincularOrdensAoCartao:", erroLiga.message)
      continue
    }
    const { data: f } = await admin.from("financeiro_cartao_faturas").select("numero").eq("id", faturaId).maybeSingle()
    await registrarEvento(
      String(o.id),
      "situacao_alterada",
      usuario,
      `Paga com o cartão de crédito ${nomeCartao(cartao as never)}: entrou na fatura nº ${f?.numero ?? "—"}${
        naFatura ? " e fica \"Na fatura\" — é quitada pela ordem da fatura" : "; autorizada, fica \"Na fatura\""
      }.`,
      { cartao_fatura_id: faturaId, ...(naFatura ? { de: SITUACAO_A_PAGAR, para: SITUACAO_NA_FATURA } : {}) }
    )
  }
}

/**
 * Ordem que acabou de ir para "A pagar" (autorização, documento fiscal, troca
 * manual): se é de fatura de cartão, fica "Na fatura". Devolve se mudou.
 */
export async function assentarNaFatura(ordemId: string): Promise<boolean> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("ordens_pagamento")
    .update({ situacao: SITUACAO_NA_FATURA })
    .eq("id", ordemId)
    .eq("situacao", SITUACAO_A_PAGAR)
    .not("cartao_fatura_id", "is", null)
    .select("id")
  if (error || !(data ?? []).length) return false
  await registrarEvento(
    ordemId,
    "situacao_alterada",
    null,
    "Compra no cartão de crédito autorizada: fica \"Na fatura\" e é quitada pela ordem da fatura.",
    { de: SITUACAO_A_PAGAR, para: SITUACAO_NA_FATURA }
  )
  return true
}

/** A fatura da ordem está fechada? (cancelar/corrigir a compra muda a fatura já paga). */
export async function faturaDaOrdemFechada(ordemId: string): Promise<boolean> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("ordens_pagamento")
    .select("cartao_fatura_id")
    .eq("id", ordemId)
    .maybeSingle()
  if (!data?.cartao_fatura_id) return false
  const { data: f } = await admin
    .from("financeiro_cartao_faturas")
    .select("situacao")
    .eq("id", String(data.cartao_fatura_id))
    .maybeSingle()
  return f?.situacao === "fechada"
}

// ── Leitura ─────────────────────────────────────────────────────────────────

function resumo(f: Record<string, unknown>, itens: { valor: number; conta: boolean }[], ordem: Record<string, unknown> | undefined): FaturaResumo {
  const contam = itens.filter((i) => i.conta)
  return {
    id: String(f.id),
    cartaoId: String(f.cartao_id),
    numero: Number(f.numero),
    situacao: f.situacao === "fechada" ? "fechada" : "aberta",
    abertaEm: String(f.aberta_em),
    fechadaEm: texto(f.fechada_em),
    valorFatura: f.valor_fatura === null || f.valor_fatura === undefined ? null : Number(f.valor_fatura),
    vencimento: texto(f.vencimento),
    ordemId: texto(f.ordem_pagamento_id),
    ordemCodigo: ordem ? texto(ordem.codigo) : null,
    ordemSituacao: ordem ? texto(ordem.situacao) : null,
    compras: contam.length,
    soma: ROUND(contam.reduce((a, i) => a + i.valor, 0)),
  }
}

/** Faturas de um cartão (a aberta primeiro, depois da mais nova para a mais antiga). */
export async function listarFaturasDoCartao(cartaoId: string): Promise<{ disponivel: boolean; faturas: FaturaResumo[] }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("financeiro_cartao_faturas")
    .select("*")
    .eq("cartao_id", cartaoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("numero", { ascending: false })
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, faturas: [] }
    throw new Error(`Falha ao listar faturas: ${error.message}`)
  }
  const faturas = (data ?? []) as Record<string, unknown>[]
  if (!faturas.length) return { disponivel: true, faturas: [] }
  const ids = faturas.map((f) => String(f.id))
  const ordemIds = faturas.map((f) => texto(f.ordem_pagamento_id)).filter((x): x is string => Boolean(x))
  const [{ data: itens }, { data: ordens }] = await Promise.all([
    admin
      .from("ordens_pagamento")
      .select("cartao_fatura_id, situacao, valor_inicial_cobranca")
      .in("cartao_fatura_id", ids)
      .not("excluido", "is", true),
    ordemIds.length
      ? admin.from("ordens_pagamento").select("id, codigo, situacao").in("id", ordemIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])
  const porFatura = new Map<string, { valor: number; conta: boolean }[]>()
  for (const i of itens ?? []) {
    const lista = porFatura.get(String(i.cartao_fatura_id)) ?? []
    lista.push({ valor: Number(i.valor_inicial_cobranca ?? 0), conta: !FORA_DA_FATURA.includes(String(i.situacao)) })
    porFatura.set(String(i.cartao_fatura_id), lista)
  }
  const ordemPorId = new Map((ordens ?? []).map((o) => [String(o.id), o as Record<string, unknown>]))
  return {
    disponivel: true,
    faturas: faturas
      .map((f) => resumo(f, porFatura.get(String(f.id)) ?? [], ordemPorId.get(String(f.ordem_pagamento_id))))
      .sort((a, b) => (a.situacao === b.situacao ? b.numero - a.numero : a.situacao === "aberta" ? -1 : 1)),
  }
}

/** Faturas abertas por cartão (para a lista de cartões). */
export async function faturasAbertas(): Promise<Map<string, { id: string; numero: number; compras: number; soma: number }>> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("financeiro_cartao_faturas")
    .select("id, cartao_id, numero")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("situacao", "aberta")
  const mapa = new Map<string, { id: string; numero: number; compras: number; soma: number }>()
  if (error || !data?.length) return mapa
  const { data: itens } = await admin
    .from("ordens_pagamento")
    .select("cartao_fatura_id, situacao, valor_inicial_cobranca")
    .in("cartao_fatura_id", data.map((f) => String(f.id)))
    .not("excluido", "is", true)
  for (const f of data) {
    const contam = (itens ?? []).filter(
      (i) => String(i.cartao_fatura_id) === String(f.id) && !FORA_DA_FATURA.includes(String(i.situacao))
    )
    mapa.set(String(f.cartao_id), {
      id: String(f.id),
      numero: Number(f.numero),
      compras: contam.length,
      soma: ROUND(contam.reduce((a, i) => a + Number(i.valor_inicial_cobranca ?? 0), 0)),
    })
  }
  return mapa
}

export type DetalheFatura = {
  fatura: FaturaResumo & { arquivoFatura: string | null; centroDiferencaId: string | null; observacao: string | null; fechadaPor: string | null }
  cartao: { id: string; nome: string; titular: string | null }
  itens: ItemFatura[]
}

export async function obterFatura(faturaId: string): Promise<DetalheFatura | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: f } = await admin
    .from("financeiro_cartao_faturas")
    .select("*")
    .eq("id", faturaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!f) return null
  const { data: c } = await admin
    .from("cartoes")
    .select("id, apelido, bandeira, final, titular:titular_usuario_id (nome_completo, nome_guerra)")
    .eq("id", String(f.cartao_id))
    .maybeSingle()
  const itens = await itensDaFatura(faturaId)
  const ordem = f.ordem_pagamento_id
    ? (await admin.from("ordens_pagamento").select("codigo, situacao").eq("id", String(f.ordem_pagamento_id)).maybeSingle()).data
    : null
  let fechadaPor: string | null = null
  if (f.fechada_por_usuario_id) {
    const { data: u } = await admin.from("usuarios").select("nome_completo, nome_guerra").eq("id", String(f.fechada_por_usuario_id)).maybeSingle()
    fechadaPor = texto(u?.nome_completo) ?? texto(u?.nome_guerra)
  }
  const titular = c?.titular as { nome_completo?: string | null; nome_guerra?: string | null } | null
  return {
    fatura: {
      ...resumo(f, itens, (ordem ?? undefined) as Record<string, unknown> | undefined),
      arquivoFatura: texto(f.arquivo_fatura),
      centroDiferencaId: texto(f.centro_diferenca_id),
      observacao: texto(f.observacao),
      fechadaPor,
    },
    cartao: {
      id: String(f.cartao_id),
      nome: c ? nomeCartao(c as never) : "Cartão",
      titular: titular?.nome_completo ?? titular?.nome_guerra ?? null,
    },
    itens,
  }
}

async function itensDaFatura(faturaId: string): Promise<ItemFatura[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("ordens_pagamento")
    .select(
      "id, codigo, descricao, situacao, valor_inicial_cobranca, vencimento, created_at, centro_custo_despesa_id, departamento_id, beneficiario_fornecedor_id, fornecedor_id, processo_compra_id"
    )
    .eq("cartao_fatura_id", faturaId)
    .not("excluido", "is", true)
    .order("created_at", { ascending: true })
  const ordens = (data ?? []) as Record<string, unknown>[]
  if (!ordens.length) return []
  const ids = ordens.map((o) => String(o.id))
  const fornIds = [...new Set(ordens.map((o) => texto(o.beneficiario_fornecedor_id) ?? texto(o.fornecedor_id)).filter(Boolean))] as string[]
  const procIds = [...new Set(ordens.map((o) => texto(o.processo_compra_id)).filter(Boolean))] as string[]
  const [{ data: rateio }, { data: forns }, { data: procs }] = await Promise.all([
    admin.from("ordens_pagamento_rateio").select("ordem_id, centro_custo_despesa_id, departamento_id, valor").in("ordem_id", ids),
    fornIds.length ? admin.from("empresa").select("id, nome_fantasia, nome_razao").in("id", fornIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    procIds.length ? admin.from("compras_solicitacoes").select("id, compra_data").in("id", procIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])
  const centroIds = [
    ...new Set(
      [...ordens.map((o) => texto(o.centro_custo_despesa_id)), ...(rateio ?? []).map((r) => texto(r.centro_custo_despesa_id))].filter(Boolean)
    ),
  ] as string[]
  const { data: centros } = centroIds.length
    ? await admin.from("centros_de_custo").select("id, acesso, nome_da_conta").in("id", centroIds)
    : { data: [] as Record<string, unknown>[] }
  const nomeCentro = new Map((centros ?? []).map((c) => [String(c.id), rotuloCentroCusto(c)]))
  const nomeForn = new Map((forns ?? []).map((e) => [String(e.id), texto(e.nome_fantasia) ?? texto(e.nome_razao)]))
  const dataCompra = new Map((procs ?? []).map((p) => [String(p.id), texto(p.compra_data)]))
  return ordens.map((o) => {
    const centroId = texto(o.centro_custo_despesa_id)
    const fornId = texto(o.beneficiario_fornecedor_id) ?? texto(o.fornecedor_id)
    const proc = texto(o.processo_compra_id)
    return {
      id: String(o.id),
      codigo: texto(o.codigo),
      descricao: texto(o.descricao),
      situacao: String(o.situacao ?? ""),
      valor: Number(o.valor_inicial_cobranca ?? 0),
      data: (proc ? dataCompra.get(proc) : null) ?? texto(o.created_at)?.slice(0, 10) ?? null,
      favorecido: fornId ? (nomeForn.get(fornId) ?? null) : null,
      centroId,
      centro: centroId ? (nomeCentro.get(centroId) ?? null) : null,
      departamentoId: texto(o.departamento_id),
      rateio: (rateio ?? [])
        .filter((r) => String(r.ordem_id) === String(o.id))
        .map((r) => {
          const cid = texto(r.centro_custo_despesa_id)
          return { centroId: cid, centro: cid ? (nomeCentro.get(cid) ?? null) : null, departamentoId: texto(r.departamento_id), valor: Number(r.valor ?? 0) }
        }),
      conta: !FORA_DA_FATURA.includes(String(o.situacao ?? "")),
    }
  })
}

/**
 * Rateio da fatura: cada compra (ou cada linha do rateio dela) cai no seu
 * centro de custo; o que vai para o mesmo centro e departamento soma numa
 * linha. A diferença para o valor da fatura vira uma linha no centro escolhido.
 */
export function rateioDaFatura(
  itens: ItemFatura[],
  diferenca: { valor: number; centroId: string | null; centro: string | null; descricao: string } | null
): LinhaRateioFatura[] {
  const grupos = new Map<string, LinhaRateioFatura & { n: number }>()
  const somar = (centroId: string | null, centro: string | null, departamentoId: string | null, valor: number) => {
    const chave = `${centroId ?? "-"}|${departamentoId ?? "-"}`
    const g = grupos.get(chave) ?? { centroId, centro, departamentoId, valor: 0, descricao: "", n: 0 }
    g.valor = ROUND(g.valor + valor)
    g.n++
    grupos.set(chave, g)
  }
  for (const i of itens.filter((x) => x.conta)) {
    if (i.rateio.length) for (const r of i.rateio) somar(r.centroId, r.centro, r.departamentoId, r.valor)
    else somar(i.centroId, i.centro, i.departamentoId, i.valor)
  }
  const linhas: LinhaRateioFatura[] = [...grupos.values()]
    .filter((g) => g.valor !== 0)
    .sort((a, b) => b.valor - a.valor)
    .map((g) => ({ centroId: g.centroId, centro: g.centro, departamentoId: g.departamentoId, valor: g.valor, descricao: `${g.n} compra(s)` }))
  if (diferenca && Math.abs(diferenca.valor) >= 0.01) {
    linhas.push({
      centroId: diferenca.centroId,
      centro: diferenca.centro,
      departamentoId: null,
      valor: ROUND(diferenca.valor),
      descricao: diferenca.descricao,
    })
  }
  return linhas
}

// ── Fechamento ──────────────────────────────────────────────────────────────

export type DadosFechamento = {
  valor: number
  vencimento: string
  arquivo: File
  formaPagamento: "Boleto" | "Pix (QR Code)"
  linhaDigitavel: string | null
  pixCodigo: string | null
  centroDiferencaId: string | null
  observacao: string | null
}

/**
 * Fecha a fatura: grava valor, vencimento e arquivo, gera a ordem rateada e
 * abre a próxima fatura do cartão. A ordem nasce "A pagar" quando todas as
 * compras já foram autorizadas e o valor bate com a soma (o que se paga foi
 * aprovado compra a compra); senão vai para a alçada ("Em autorização").
 */
export async function fecharFatura(
  faturaId: string,
  dados: DadosFechamento,
  usuarioId: string
): Promise<{ erro?: string; ordemId?: string; ordemCodigo?: string; autorizada?: boolean }> {
  const det = await obterFatura(faturaId)
  if (!det) return { erro: "Fatura não encontrada." }
  if (det.fatura.situacao !== "aberta") return { erro: "Esta fatura já foi fechada." }
  if (!(dados.valor > 0)) return { erro: "Informe o valor da fatura." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.vencimento)) return { erro: "Informe o vencimento da fatura." }
  const contam = det.itens.filter((i) => i.conta)
  const soma = ROUND(contam.reduce((a, i) => a + i.valor, 0))
  const dif = ROUND(dados.valor - soma)
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let centroDif: { id: string; rotulo: string } | null = null
  if (Math.abs(dif) >= 0.01) {
    if (!dados.centroDiferencaId) {
      return { erro: `A fatura difere da soma das compras em ${formatarMoeda(dif)} — escolha o centro de custo da diferença.` }
    }
    const { data: c } = await admin
      .from("centros_de_custo")
      .select("id, acesso, nome_da_conta")
      .eq("id", dados.centroDiferencaId)
      .maybeSingle()
    if (!c) return { erro: "Centro de custo da diferença inválido." }
    centroDif = { id: String(c.id), rotulo: rotuloCentroCusto(c) }
  }

  // Trava a fatura antes de gerar a ordem: duas pessoas não fecham a mesma.
  const { data: travada, error: erroTrava } = await admin
    .from("financeiro_cartao_faturas")
    .update({ situacao: "fechada", fechada_em: new Date().toISOString(), fechada_por_usuario_id: usuarioId })
    .eq("id", faturaId)
    .eq("situacao", "aberta")
    .select("id")
  if (erroTrava) return { erro: `Não foi possível fechar a fatura: ${erroTrava.message}` }
  if (!(travada ?? []).length) return { erro: "Esta fatura já foi fechada por outra pessoa." }
  const destravar = () =>
    admin
      .from("financeiro_cartao_faturas")
      .update({ situacao: "aberta", fechada_em: null, fechada_por_usuario_id: null })
      .eq("id", faturaId)

  const up = await subirComprovanteCompras(`faturas-cartao/${faturaId}`, dados.arquivo)
  if (up.erro || !up.caminho) {
    await destravar()
    return { erro: up.erro ?? "Falha ao subir a fatura." }
  }

  const linhas = rateioDaFatura(
    det.itens,
    centroDif
      ? {
          valor: dif,
          centroId: centroDif.id,
          centro: centroDif.rotulo,
          descricao: dados.observacao?.trim() || (dif > 0 ? "Diferença da fatura (juros, IOF, anuidade…)" : "Diferença da fatura (estornos, créditos…)"),
        }
      : null
  )
  const pendentes = contam.filter((i) => i.situacao !== SITUACAO_NA_FATURA && i.situacao !== "Paga")
  const autoriza = pendentes.length === 0 && Math.abs(dif) < 0.01 && contam.length > 0
  const codigo = gerarCodigoProcesso()
  const numero = det.fatura.numero
  const motivo = `Fatura nº ${numero} do cartão ${det.cartao.nome}: as ${contam.length} compra(s) foram autorizadas uma a uma na alçada e o valor bate com a soma.`
  const descricao = [
    `Fatura nº ${numero} do cartão ${det.cartao.nome} — ${contam.length} compra(s) de ${formatarData(det.fatura.abertaEm.slice(0, 10))} a ${formatarData(hojeSP())}.`,
    `Compras ${formatarMoeda(soma)}${Math.abs(dif) >= 0.01 ? `; diferença ${formatarMoeda(dif)}` : ""}.`,
    linhas.length > 1 ? `Rateada em ${linhas.length} centros de custo.` : null,
  ]
    .filter(Boolean)
    .join(" ")

  const { data: ordem, error: erroOrdem } = await inserirOrdemVerificada({
    codigo,
    tipo: TIPO_ORDEM_FATURA_CARTAO,
    descricao,
    ...(autoriza
      ? {
          situacao: SITUACAO_A_PAGAR,
          autorizacao_esta_autorizado: true,
          autorizacao_autorizador_id: usuarioId,
          autorizacao_data: hojeSP(),
          autorizacao_observacao: motivo,
          autorizacao_dispensada: true,
          autorizacao_dispensa_motivo: motivo,
        }
      : { situacao: SITUACAO_EM_AUTORIZACAO }),
    valor_inicial_cobranca: dados.valor,
    vencimento: dados.vencimento,
    forma_pagamento: dados.formaPagamento,
    ...(dados.formaPagamento === "Boleto"
      ? { arquivo_boleto: up.caminho, boleto_linha_digitavel: dados.linhaDigitavel }
      : { pix_codigo: dados.pixCodigo }),
    arquivo_nota_fiscal: up.caminho,
    beneficiario_nome_avulso: `Fatura do cartão ${det.cartao.nome}`,
    centro_custo_despesa_id: linhas[0]?.centroId ?? null,
    departamento_id: linhas[0]?.departamentoId ?? null,
    excluido: false,
    emp_proprietaria_id: emp,
  })
  if (erroOrdem || !ordem) {
    await admin.storage.from("compras").remove([up.caminho])
    await destravar()
    return { erro: `Não foi possível gerar a ordem de pagamento: ${erroOrdem?.message}` }
  }

  if (linhas.length > 1) {
    const { error: erroRateio } = await admin.from("ordens_pagamento_rateio").insert(
      linhas.map((l, i) => ({
        ordem_id: ordem.id,
        centro_custo_despesa_id: l.centroId,
        departamento_id: l.departamentoId,
        descricao: l.descricao,
        valor: l.valor,
        ordem: i,
        emp_proprietaria_id: emp,
      }))
    )
    if (erroRateio) {
      await admin.from("ordens_pagamento").delete().eq("id", ordem.id)
      await admin.storage.from("compras").remove([up.caminho])
      await destravar()
      return { erro: `Não foi possível gravar o rateio: ${erroRateio.message}` }
    }
  }

  const { error: erroFecha } = await admin
    .from("financeiro_cartao_faturas")
    .update({
      valor_fatura: dados.valor,
      vencimento: dados.vencimento,
      arquivo_fatura: up.caminho,
      centro_diferenca_id: centroDif?.id ?? null,
      ordem_pagamento_id: ordem.id,
      observacao: dados.observacao?.trim() || null,
    })
    .eq("id", faturaId)
  if (erroFecha) console.error("fecharFatura:", erroFecha.message)

  await registrarEvento(
    ordem.id,
    "criada",
    usuarioId,
    `Gerada no fechamento da fatura nº ${numero} do cartão ${det.cartao.nome} (${contam.length} compra(s)).`,
    { cartao_fatura_id: faturaId, compras: contam.map((i) => i.id), diferenca: dif }
  )
  if (autoriza) await registrarEvento(ordem.id, "autorizacao_dispensada", usuarioId, motivo)
  // A próxima fatura já fica aberta para as compras seguintes.
  await garantirFaturaAberta(det.cartao.id)
  return { ordemId: ordem.id, ordemCodigo: codigo, autorizada: autoriza }
}

/** Fatura cuja ordem é esta (procedência da ordem da fatura). */
export async function faturaDaOrdemGerada(ordemId: string): Promise<DetalheFatura | null> {
  const admin = await createAdminClient()
  const { data } = await admin.from("financeiro_cartao_faturas").select("id").eq("ordem_pagamento_id", ordemId).maybeSingle()
  return data ? obterFatura(String(data.id)) : null
}

/** Número e id da fatura de uma ordem de compra (tela da ordem). */
export async function faturaDaCompra(faturaId: string): Promise<{ id: string; numero: number; situacao: string } | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("financeiro_cartao_faturas")
    .select("id, numero, situacao")
    .eq("id", faturaId)
    .maybeSingle()
  return data ? { id: String(data.id), numero: Number(data.numero), situacao: String(data.situacao) } : null
}
