import "server-only"

import { esquemaAusente, hojeSP, texto } from "@/lib/db/comum"
import { alterarSituacaoOrdem, cancelarOrdem, registrarEvento } from "@/lib/db/ordens-ciclo"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * COMPRA CANCELADA PELO VENDEDOR (14/11/2026). A compra foi feita, mas o
 * vendedor cancelou: o dinheiro volta (devolução/estorno) ou fica como
 * crédito para compras futuras. A nota nunca vai chegar, então:
 *
 * - o fornecimento guarda o desfecho e sai de Notas a receber (e dos avisos);
 * - as ordens dele ainda não pagas são canceladas;
 * - nas pagas, o comprovante do cancelamento vira o documento equivalente à
 *   nota (a auditoria "sem nota" deixa de cobrar) e a trilha registra o
 *   crédito ou a devolução para o Financeiro;
 * - o crédito fica em aberto (Créditos com fornecedores) até ser usado.
 */

export type DesfechoCancelamento = "credito" | "devolucao"

export const ROTULO_DESFECHO: Record<DesfechoCancelamento, string> = {
  credito: "Crédito para compras futuras",
  devolucao: "Devolução do dinheiro",
}

const ENCERRADAS = ["Paga", "Cancelada", "Estornado"]

/** Aviso de crédito perto de vencer (dias). */
export const DIAS_AVISO_VALIDADE = 30

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate.slice(0, 10)}T12:00:00Z`) - Date.parse(`${de.slice(0, 10)}T12:00:00Z`)) / 86_400_000)
}

export async function registrarCancelamentoCompra(dados: {
  processoId: string
  fornecimentoId: string
  desfecho: DesfechoCancelamento
  valor: number | null
  data: string
  obs: string | null
  comprovante: string | null
  usuarioId: string
  /** Crédito: até quando vale (opcional). */
  creditoValidade?: string | null
  /** Só parte da compra (o valor) foi cancelada: a compra segue ativa. */
  parcial?: boolean
}): Promise<{ erro?: string; avisos?: string[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const parcial = dados.parcial === true
  const { data: f } = await admin
    .from("compras_fornecimentos")
    .select("id, processo_id, valor, nota_fiscal_url, ordem_pagamento_id, cancelamento_desfecho")
    .eq("id", dados.fornecimentoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!f || f.processo_id !== dados.processoId) return { erro: "Fornecimento não encontrado neste processo." }
  if (f.cancelamento_desfecho) return { erro: "O cancelamento desta compra já foi registrado." }
  if (parcial) {
    if (dados.valor === null || !(dados.valor > 0)) return { erro: "Informe o valor da parte cancelada." }
    if (f.valor !== null && dados.valor >= Number(f.valor) - 0.005) {
      return { erro: "O valor cancelado é a compra toda — escolha \"Toda a compra\"." }
    }
  }

  const { error } = await admin
    .from("compras_fornecimentos")
    .update({
      cancelamento_desfecho: dados.desfecho,
      cancelamento_valor: dados.valor,
      cancelamento_data: dados.data,
      cancelamento_obs: dados.obs,
      cancelamento_comprovante_url: dados.comprovante,
      credito_validade: dados.desfecho === "credito" ? (dados.creditoValidade ?? null) : null,
      cancelado_em: new Date().toISOString(),
      cancelado_por_id: dados.usuarioId,
      cancelamento_parcial: parcial,
      // Parcial: a compra segue esperando a nota do que ficou.
      ...(parcial ? {} : { nota_a_receber: false }),
      updated_at: new Date().toISOString(),
    })
    .eq("id", dados.fornecimentoId)
  if (error) {
    if (esquemaAusente(error)) return { erro: "O cancelamento de compra ainda não está disponível." }
    return { erro: `Não foi possível registrar o cancelamento: ${error.message}` }
  }

  const valorTxt = dados.valor !== null ? formatarMoeda(dados.valor) : "valor não informado"
  const resumo = parcial
    ? `Parte da compra (${valorTxt}) cancelada pelo vendedor em ${formatarData(dados.data)}.`
    : dados.desfecho === "credito"
      ? `Compra cancelada pelo vendedor em ${formatarData(dados.data)} — virou crédito para compras futuras (${valorTxt}).`
      : `Compra cancelada pelo vendedor em ${formatarData(dados.data)} — dinheiro devolvido (${valorTxt}).`
  const motivo = [resumo, dados.obs].filter(Boolean).join(" ")

  // Ordens do fornecimento: as com fornecimento_id e a principal.
  const { data: ordens } = await admin
    .from("ordens_pagamento")
    .select("id, codigo, situacao, arquivo_nota_fiscal, fornecimento_id, valor_inicial_cobranca")
    .eq("emp_proprietaria_id", emp)
    .eq("processo_compra_id", dados.processoId)
    .not("excluido", "is", true)
  const doFornecimento = (ordens ?? []).filter(
    (o) => o.fornecimento_id === dados.fornecimentoId || (f.ordem_pagamento_id && o.id === f.ordem_pagamento_id)
  )
  const avisos: string[] = []
  if (parcial) return cancelamentoParcialNasOrdens(doFornecimento, f.id as string, dados, motivo)
  let algumaPaga = false
  for (const o of doFornecimento) {
    const situacao = texto(o.situacao) ?? ""
    if (situacao === "Cancelada" || situacao === "Estornado") continue
    if (!ENCERRADAS.includes(situacao)) {
      const r = await cancelarOrdem(String(o.id), dados.usuarioId, motivo)
      if (r.erro) avisos.push(`Ordem ${texto(o.codigo) ?? ""}: ${r.erro}`)
      continue
    }
    // Paga: o comprovante do cancelamento é o documento da despesa.
    if (situacao === "Paga") algumaPaga = true
    const semNota = !texto(o.arquivo_nota_fiscal)
    if (semNota && dados.comprovante) {
      await admin.from("ordens_pagamento").update({ arquivo_nota_fiscal: dados.comprovante }).eq("id", String(o.id))
    }
    await registrarEvento(String(o.id), "corrigida", dados.usuarioId, motivo, {
      campo: "cancelamento_compra",
      desfecho: dados.desfecho,
      valor: dados.valor,
      data: dados.data,
      ...(semNota && dados.comprovante ? { antes: null, depois: dados.comprovante } : {}),
    })
  }
  // Devolução sem nada pago (as ordens foram canceladas): não há dinheiro a voltar.
  if (dados.desfecho === "devolucao" && !algumaPaga) {
    await admin
      .from("compras_fornecimentos")
      .update({
        devolucao_recebida_em: new Date().toISOString(),
        devolucao_recebida_por_id: dados.usuarioId,
        devolucao_recebida_obs: "Nada a devolver: nenhuma ordem da compra tinha sido paga.",
      })
      .eq("id", dados.fornecimentoId)
  }
  return avisos.length ? { avisos } : {}
}

/**
 * Cancelamento parcial: a ordem ainda não paga que comporta o valor é
 * reduzida nele — aí não há crédito nem devolução (paga-se menos). Sem ordem
 * em aberto que comporte, o valor vira crédito ou devolução como no total.
 */
async function cancelamentoParcialNasOrdens(
  ordens: Record<string, unknown>[],
  fornecimentoId: string,
  dados: { desfecho: DesfechoCancelamento; valor: number | null; usuarioId: string },
  motivo: string
): Promise<{ avisos?: string[] }> {
  const admin = await createAdminClient()
  const valor = dados.valor ?? 0
  const aberta = ordens
    .filter((o) => !ENCERRADAS.includes(texto(o.situacao) ?? "") && texto(o.situacao) !== "Na fatura")
    .filter((o) => Number(o.valor_inicial_cobranca ?? 0) - valor >= 0.01)
    .sort((a, b) => Number(b.valor_inicial_cobranca ?? 0) - Number(a.valor_inicial_cobranca ?? 0))[0]
  if (aberta) {
    const antes = Number(aberta.valor_inicial_cobranca)
    const depois = centavos(antes - valor)
    await admin.from("ordens_pagamento").update({ valor_inicial_cobranca: depois }).eq("id", String(aberta.id))
    await registrarEvento(String(aberta.id), "corrigida", dados.usuarioId, `${motivo} Valor da ordem reduzido de ${formatarMoeda(antes)} para ${formatarMoeda(depois)}.`, {
      campo: "valor_inicial_cobranca",
      antes,
      depois,
      cancelamento_parcial: true,
    })
    const obs = `Abatido na ordem ${texto(aberta.codigo) ?? ""} ainda não paga.`
    await admin
      .from("compras_fornecimentos")
      .update({
        cancelamento_ordem_reduzida_id: String(aberta.id),
        ...(dados.desfecho === "credito"
          ? { credito_usado_em: new Date().toISOString(), credito_usado_por_id: dados.usuarioId, credito_usado_obs: obs }
          : { devolucao_recebida_em: new Date().toISOString(), devolucao_recebida_por_id: dados.usuarioId, devolucao_recebida_obs: `Nada a devolver: ${obs}` }),
      })
      .eq("id", fornecimentoId)
    return {}
  }
  // Tudo pago (ou em fatura): o valor cancelado vira crédito/devolução; a trilha avisa nas pagas.
  const pagas = ordens.filter((o) => texto(o.situacao) === "Paga")
  if (pagas.length) {
    await registrarEvento(pagas.map((o) => String(o.id)), "corrigida", dados.usuarioId, motivo, {
      campo: "cancelamento_compra",
      parcial: true,
      desfecho: dados.desfecho,
      valor: dados.valor,
    })
  } else if (dados.desfecho === "devolucao") {
    await admin
      .from("compras_fornecimentos")
      .update({
        devolucao_recebida_em: new Date().toISOString(),
        devolucao_recebida_por_id: dados.usuarioId,
        devolucao_recebida_obs: "Nada a devolver: nenhuma ordem da compra tinha sido paga.",
      })
      .eq("id", fornecimentoId)
  }
  const semOrdemQueComporte = ordens.some((o) => !ENCERRADAS.includes(texto(o.situacao) ?? ""))
  return semOrdemQueComporte
    ? { avisos: ["Nenhuma ordem em aberto comporta o valor cancelado: ajuste o valor da ordem pelo Financeiro, se for o caso."] }
    : {}
}

export type CreditoFornecedor = {
  fornecimentoId: string
  processoId: string
  codigo: string | null
  produto: string | null
  fornecedor: string
  /** Saldo em aberto. */
  valor: number | null
  /** Quanto já foi abatido em compras novas. */
  usado: number
  /** Até quando vale; null = sem validade. */
  validade: string | null
  /** Dias até vencer (negativo = vencido). */
  diasParaVencer: number | null
  data: string | null
  obs: string | null
}

/** Créditos de compras canceladas ainda não usados, mais antigos primeiro. */
export async function creditosEmAberto(): Promise<{ disponivel: boolean; itens: CreditoFornecedor[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("compras_fornecimentos")
    .select("id, processo_id, fornecedor_id, vendedor_id, cancelamento_valor, cancelamento_data, cancelamento_obs, credito_validade")
    .eq("emp_proprietaria_id", emp)
    .eq("cancelamento_desfecho", "credito")
    .is("credito_usado_em", null)
    .order("cancelamento_data", { ascending: true })
    .limit(500)
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, itens: [] }
    throw new Error(`Falha ao listar os créditos: ${error.message}`)
  }
  const linhas = data ?? []
  if (!linhas.length) return { disponivel: true, itens: [] }
  const ids = (k: "processo_id" | "fornecedor_id" | "vendedor_id") =>
    [...new Set(linhas.map((l) => texto(l[k])).filter((v): v is string => !!v))]
  const [procs, empresas] = await Promise.all([
    admin.from("compras_solicitacoes").select("id, codigo, solicitacao_produto").in("id", ids("processo_id")),
    admin.from("empresa").select("id, nome_fantasia, nome_razao").in("id", [...ids("fornecedor_id"), ...ids("vendedor_id")]),
  ])
  const usado = await usadoPorCredito(linhas.map((l) => String(l.id)))
  const proc = new Map((procs.data ?? []).map((p) => [String(p.id), p]))
  const nome = new Map((empresas.data ?? []).map((e) => [String(e.id), texto(e.nome_fantasia) ?? texto(e.nome_razao)]))
  return {
    disponivel: true,
    itens: linhas.map((l) => {
      const p = proc.get(String(l.processo_id))
      const marketplace = nome.get(String(l.fornecedor_id)) ?? null
      const vendedor = l.vendedor_id ? (nome.get(String(l.vendedor_id)) ?? null) : null
      return {
        fornecimentoId: String(l.id),
        processoId: String(l.processo_id),
        codigo: texto(p?.codigo),
        produto: texto(p?.solicitacao_produto),
        fornecedor: vendedor && marketplace ? `${vendedor} (via ${marketplace})` : (vendedor ?? marketplace ?? "(fornecedor)"),
        // Saldo: o valor do crédito menos o já abatido em compras novas.
        valor:
          l.cancelamento_valor === null
            ? null
            : Math.round((Number(l.cancelamento_valor) - (usado.get(String(l.id)) ?? 0)) * 100) / 100,
        usado: usado.get(String(l.id)) ?? 0,
        data: texto(l.cancelamento_data),
        obs: texto(l.cancelamento_obs),
        validade: texto(l.credito_validade),
        diasParaVencer: l.credito_validade ? diasEntre(hojeSP(), String(l.credito_validade)) : null,
      }
    }),
  }
}

/** Marca o crédito como usado (em que compra, ou observação). */
export async function marcarCreditoUsado(fornecimentoId: string, obs: string, usuarioId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("compras_fornecimentos")
    .update({ credito_usado_em: new Date().toISOString(), credito_usado_por_id: usuarioId, credito_usado_obs: obs || null })
    .eq("id", fornecimentoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("cancelamento_desfecho", "credito")
    .is("credito_usado_em", null)
    .select("id")
  if (error) return { erro: `Não foi possível marcar o crédito: ${error.message}` }
  if (!data?.length) return { erro: "Crédito não encontrado ou já usado." }
  return {}
}

// ── Abater o crédito na compra nova (14/11/2026) ─────────────────────────────

export type CreditoDisponivel = {
  fornecimentoId: string
  processoId: string
  codigo: string | null
  saldo: number
}

export type PlanoAbatimento = {
  abatido: number
  usos: { creditoId: string; codigo: string | null; valor: number }[]
}

const centavos = (v: number) => Math.round(v * 100) / 100

/** Soma dos usos ainda válidos de cada crédito. */
async function usadoPorCredito(ids: string[]): Promise<Map<string, number>> {
  const usado = new Map<string, number>()
  if (!ids.length) return usado
  const admin = await createAdminClient()
  const { data } = await admin
    .from("compras_creditos_usos")
    .select("credito_fornecimento_id, valor")
    .in("credito_fornecimento_id", ids)
    .is("desfeito_em", null)
  for (const u of data ?? []) {
    const k = String(u.credito_fornecimento_id)
    usado.set(k, centavos((usado.get(k) ?? 0) + Number(u.valor ?? 0)))
  }
  return usado
}

/**
 * Créditos em aberto de um fornecedor (como marketplace ou como vendedor),
 * com o saldo de cada um, mais antigos primeiro.
 */
export async function creditosDoFornecedor(fornecedorId: string): Promise<CreditoDisponivel[]> {
  if (!fornecedorId) return []
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("compras_fornecimentos")
    .select("id, processo_id, cancelamento_valor, cancelamento_data")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("cancelamento_desfecho", "credito")
    .is("credito_usado_em", null)
    .or(`credito_validade.is.null,credito_validade.gte.${hojeSP()}`)
    .or(`fornecedor_id.eq.${fornecedorId},vendedor_id.eq.${fornecedorId}`)
    .order("cancelamento_data", { ascending: true })
  if (error || !data?.length) return []
  const usado = await usadoPorCredito(data.map((c) => String(c.id)))
  const { data: procs } = await admin
    .from("compras_solicitacoes")
    .select("id, codigo")
    .in("id", data.map((c) => String(c.processo_id)))
  const codigo = new Map((procs ?? []).map((p) => [String(p.id), texto(p.codigo)]))
  return data
    .map((c) => ({
      fornecimentoId: String(c.id),
      processoId: String(c.processo_id),
      codigo: codigo.get(String(c.processo_id)) ?? null,
      saldo: centavos(Number(c.cancelamento_valor ?? 0) - (usado.get(String(c.id)) ?? 0)),
    }))
    .filter((c) => c.saldo > 0.005)
}

/** Quanto do crédito do fornecedor abate um valor (os mais antigos primeiro). */
export async function planejarAbatimento(fornecedorId: string, valor: number): Promise<PlanoAbatimento> {
  const usos: PlanoAbatimento["usos"] = []
  let falta = centavos(valor)
  for (const c of await creditosDoFornecedor(fornecedorId)) {
    if (falta <= 0.005) break
    const v = centavos(Math.min(c.saldo, falta))
    usos.push({ creditoId: c.fornecimentoId, codigo: c.codigo, valor: v })
    falta = centavos(falta - v)
  }
  return { abatido: centavos(usos.reduce((s, u) => s + u.valor, 0)), usos }
}

/** Texto para a descrição da ordem: "crédito de R$ X abatido (compra Y)". */
export function descreverAbatimento(plano: PlanoAbatimento): string {
  const origens = plano.usos.map((u) => u.codigo).filter(Boolean).join(", ")
  return `crédito de ${formatarMoeda(plano.abatido)} abatido${origens ? ` (compra cancelada ${origens})` : ""}`
}

/**
 * Grava os usos depois que a ordem existe e fecha os créditos que zeraram
 * (saem de "Créditos com fornecedores").
 */
export async function registrarUsosCredito(
  plano: PlanoAbatimento,
  dados: { ordemId: string; processoId: string; codigoProcesso: string | null; usuarioId: string }
): Promise<void> {
  if (!plano.usos.length) return
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin.from("compras_creditos_usos").insert(
    plano.usos.map((u) => ({
      emp_proprietaria_id: emp,
      credito_fornecimento_id: u.creditoId,
      processo_id: dados.processoId,
      ordem_id: dados.ordemId,
      valor: u.valor,
      criado_por_id: dados.usuarioId,
    }))
  )
  if (error) {
    console.error("registrarUsosCredito:", error.message)
    return
  }
  await fecharCreditosZerados(plano.usos.map((u) => u.creditoId), dados.usuarioId, dados.codigoProcesso)
  await registrarEvento(dados.ordemId, "corrigida", dados.usuarioId, `Valor com ${descreverAbatimento(plano)}.`, {
    campo: "credito_abatido",
    valor: plano.abatido,
    creditos: plano.usos.map((u) => ({ credito: u.creditoId, valor: u.valor })),
  })
}

async function fecharCreditosZerados(ids: string[], usuarioId: string, codigoProcesso: string | null) {
  const admin = await createAdminClient()
  const { data } = await admin.from("compras_fornecimentos").select("id, cancelamento_valor").in("id", ids)
  const usado = await usadoPorCredito(ids)
  for (const c of data ?? []) {
    if (Number(c.cancelamento_valor ?? 0) - (usado.get(String(c.id)) ?? 0) > 0.005) continue
    await admin
      .from("compras_fornecimentos")
      .update({
        credito_usado_em: new Date().toISOString(),
        credito_usado_por_id: usuarioId,
        credito_usado_obs: `Abatido na compra ${codigoProcesso ?? ""}`.trim(),
      })
      .eq("id", String(c.id))
      .is("credito_usado_em", null)
  }
}

/**
 * A ordem que usou crédito foi cancelada: o uso é desfeito e o valor volta ao
 * saldo (o crédito reabre se tinha fechado pelo abatimento).
 */
export async function desfazerUsosDaOrdem(ordemId: string, motivo: string): Promise<void> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("compras_creditos_usos")
    .update({ desfeito_em: new Date().toISOString(), desfeito_motivo: motivo.slice(0, 500) })
    .eq("ordem_id", ordemId)
    .is("desfeito_em", null)
    .select("credito_fornecimento_id")
  const ids = [...new Set((data ?? []).map((u) => String(u.credito_fornecimento_id)))]
  if (!ids.length) return
  await admin
    .from("compras_fornecimentos")
    .update({ credito_usado_em: null, credito_usado_por_id: null, credito_usado_obs: null })
    .in("id", ids)
    .like("credito_usado_obs", "Abatido na compra%")
}

/** Crédito já abatido nas ordens (para o "restante" do fornecimento). */
export async function creditoAbatidoNasOrdens(ordemIds: string[]): Promise<number> {
  if (!ordemIds.length) return 0
  const admin = await createAdminClient()
  const { data } = await admin
    .from("compras_creditos_usos")
    .select("valor")
    .in("ordem_id", ordemIds)
    .is("desfeito_em", null)
  return centavos((data ?? []).reduce((s, u) => s + Number(u.valor ?? 0), 0))
}

/**
 * Saldo de crédito por fornecedor (marketplace e vendedor), para o formulário
 * de compra nova mostrar "abater crédito" ao escolher o fornecedor.
 */
export async function saldosDeCreditoPorFornecedor(): Promise<Record<string, number>> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("compras_fornecimentos")
    .select("id, fornecedor_id, vendedor_id, cancelamento_valor")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("cancelamento_desfecho", "credito")
    .is("credito_usado_em", null)
    .or(`credito_validade.is.null,credito_validade.gte.${hojeSP()}`)
    .limit(500)
  if (error || !data?.length) return {}
  const usado = await usadoPorCredito(data.map((c) => String(c.id)))
  const saldos: Record<string, number> = {}
  for (const c of data) {
    const saldo = centavos(Number(c.cancelamento_valor ?? 0) - (usado.get(String(c.id)) ?? 0))
    if (saldo <= 0.005) continue
    for (const id of new Set([texto(c.fornecedor_id), texto(c.vendedor_id)].filter((v): v is string => !!v))) {
      saldos[id] = centavos((saldos[id] ?? 0) + saldo)
    }
  }
  return saldos
}

// ── Devolução a receber (15/11/2026) ─────────────────────────────────────────

/**
 * Devolução sem notícia há este tanto de dias (desde o cancelamento ou a
 * última cobrança): "cobrar o fornecedor".
 */
export const DIAS_COBRAR_DEVOLUCAO = 30

export type DevolucaoAReceber = {
  fornecimentoId: string
  processoId: string
  codigo: string | null
  produto: string | null
  fornecedor: string
  /** Valor cancelado (o que deveria voltar). */
  valor: number | null
  /** Quanto já voltou (recebimentos parciais). */
  recebido: number
  /** O que ainda falta voltar. */
  saldo: number | null
  recebimentos: { valor: number; data: string; obs: string | null; conciliado: boolean }[]
  /** Data do cancelamento. */
  data: string | null
  dias: number
  /** Última cobrança feita ao fornecedor. */
  cobradaEm: string | null
  cobrancaObs: string | null
  /** Dias desde o cancelamento ou a última cobrança, o que for mais recente. */
  diasSemNoticia: number
  /** Passou de DIAS_COBRAR_DEVOLUCAO sem notícia: cobrar o fornecedor. */
  parada: boolean
  /**
   * Créditos pendentes do extrato que parecem ser ela: o valor que falta
   * (exato) ou um pouco menos (taxa descontada, devolução em partes).
   */
  sugestoes: { lancamentoId: string; data: string; descricao: string | null; valor: number; exato: boolean }[]
}

function somarDiasIso(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Soma do que já voltou de cada devolução. */
async function recebidoPorDevolucao(ids: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>()
  if (!ids.length) return mapa
  const admin = await createAdminClient()
  const { data } = await admin.from("compras_devolucoes_recebimentos").select("fornecimento_id, valor").in("fornecimento_id", ids)
  for (const r of data ?? []) {
    const k = String(r.fornecimento_id)
    mapa.set(k, centavos((mapa.get(k) ?? 0) + Number(r.valor ?? 0)))
  }
  return mapa
}

/**
 * Compras canceladas com devolução do dinheiro que ainda não voltou (toda ou
 * em parte), as paradas primeiro, com os créditos do extrato que parecem ser
 * ela (a partir de 3 dias antes do cancelamento).
 */
export async function devolucoesAReceber(): Promise<{ disponivel: boolean; itens: DevolucaoAReceber[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("compras_fornecimentos")
    .select("id, processo_id, fornecedor_id, vendedor_id, cancelamento_valor, cancelamento_data, devolucao_cobrada_em, devolucao_cobranca_obs")
    .eq("emp_proprietaria_id", emp)
    .eq("cancelamento_desfecho", "devolucao")
    .is("devolucao_recebida_em", null)
    .order("cancelamento_data", { ascending: true })
    .limit(300)
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, itens: [] }
    throw new Error(`Falha ao listar as devoluções: ${error.message}`)
  }
  const linhas = data ?? []
  if (!linhas.length) return { disponivel: true, itens: [] }
  const ids = (k: "processo_id" | "fornecedor_id" | "vendedor_id") =>
    [...new Set(linhas.map((l) => texto(l[k])).filter((v): v is string => !!v))]
  const hoje = hojeSP()
  const maisAntiga = linhas.map((l) => texto(l.cancelamento_data) ?? hoje).sort()[0]
  const [procs, empresas, creditos, recs] = await Promise.all([
    admin.from("compras_solicitacoes").select("id, codigo, solicitacao_produto").in("id", ids("processo_id")),
    admin.from("empresa").select("id, nome_fantasia, nome_razao").in("id", [...ids("fornecedor_id"), ...ids("vendedor_id")]),
    admin
      .from("banco_lancamentos")
      .select("id, data, valor, descricao")
      .eq("emp_proprietaria_id", emp)
      .eq("situacao", "pendente")
      .gt("valor", 0)
      .gte("data", somarDiasIso(maisAntiga, -3))
      .order("data", { ascending: true })
      .limit(1000),
    admin
      .from("compras_devolucoes_recebimentos")
      .select("fornecimento_id, valor, data, obs, lancamento_id")
      .in("fornecimento_id", linhas.map((l) => String(l.id)))
      .order("data", { ascending: true }),
  ])
  const proc = new Map((procs.data ?? []).map((p) => [String(p.id), p]))
  const nome = new Map((empresas.data ?? []).map((e) => [String(e.id), texto(e.nome_fantasia) ?? texto(e.nome_razao)]))
  const itens = linhas.map((l): DevolucaoAReceber => {
    const p = proc.get(String(l.processo_id))
    const marketplace = nome.get(String(l.fornecedor_id)) ?? null
    const vendedor = l.vendedor_id ? (nome.get(String(l.vendedor_id)) ?? null) : null
    const valor = l.cancelamento_valor === null ? null : Number(l.cancelamento_valor)
    const meus = (recs.data ?? []).filter((r) => String(r.fornecimento_id) === String(l.id))
    const recebido = centavos(meus.reduce((s, r) => s + Number(r.valor ?? 0), 0))
    const saldo = valor === null ? null : Math.max(0, centavos(valor - recebido))
    const data = texto(l.cancelamento_data)
    const cobradaEm = texto(l.devolucao_cobrada_em)
    const referencia = [data, cobradaEm].filter((v): v is string => !!v).sort().pop() ?? hoje
    const diasSemNoticia = Math.max(0, diasEntre(referencia, hoje))
    const desde = somarDiasIso(data ?? hoje, -3)
    return {
      fornecimentoId: String(l.id),
      processoId: String(l.processo_id),
      codigo: texto(p?.codigo),
      produto: texto(p?.solicitacao_produto),
      fornecedor: vendedor && marketplace ? `${vendedor} (via ${marketplace})` : (vendedor ?? marketplace ?? "(fornecedor)"),
      valor,
      recebido,
      saldo,
      recebimentos: meus.map((r) => ({ valor: Number(r.valor), data: String(r.data), obs: texto(r.obs), conciliado: Boolean(r.lancamento_id) })),
      data,
      dias: data ? Math.max(0, diasEntre(data, hoje)) : 0,
      cobradaEm,
      cobrancaObs: texto(l.devolucao_cobranca_obs),
      diasSemNoticia,
      parada: diasSemNoticia >= DIAS_COBRAR_DEVOLUCAO,
      sugestoes:
        saldo === null || saldo <= 0
          ? []
          : (creditos.data ?? [])
              .filter((c) => String(c.data) >= desde)
              .map((c) => ({ c, v: Number(c.valor) }))
              // O que falta, ou entre metade e o que falta (taxa retida, devolução em partes).
              .filter(({ v }) => Math.abs(v - saldo) < 0.005 || (v < saldo && v >= saldo / 2))
              .sort((a, b) => Math.abs(a.v - saldo) - Math.abs(b.v - saldo))
              .slice(0, 3)
              .map(({ c, v }) => ({
                lancamentoId: String(c.id),
                data: String(c.data).slice(0, 10),
                descricao: texto(c.descricao),
                valor: v,
                exato: Math.abs(v - saldo) < 0.005,
              })),
    }
  })
  // Paradas primeiro (as mais antigas no topo); depois por data do cancelamento.
  itens.sort((a, b) => Number(b.parada) - Number(a.parada) || b.diasSemNoticia - a.diasSemNoticia)
  return { disponivel: true, itens }
}

/** Ordens pagas da compra (as do fornecimento), para a trilha da devolução. */
async function ordensPagasDaDevolucao(processoId: string, fornecimentoId: string): Promise<string[]> {
  const admin = await createAdminClient()
  const { data: ordens } = await admin
    .from("ordens_pagamento")
    .select("id, fornecimento_id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("processo_compra_id", processoId)
    .eq("situacao", "Paga")
  return (ordens ?? []).filter((o) => !o.fornecimento_id || o.fornecimento_id === fornecimentoId).map((o) => String(o.id))
}

/**
 * Dinheiro da devolução que voltou — todo ou parte. Com lancamentoId, o
 * crédito do extrato fica conciliado e o valor é o dele; sem ele (estorno na
 * fatura do cartão, outro caminho), o valor informado (padrão: o que falta).
 * Quando o recebido cobre o cancelado, a devolução se encerra; senão fica
 * aberta com o saldo.
 */
export async function receberDevolucao(dados: {
  fornecimentoId: string
  usuarioId: string
  obs: string | null
  lancamentoId?: string | null
  valor?: number | null
  data?: string | null
}): Promise<{ erro?: string; encerrada?: boolean; saldo?: number }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: f } = await admin
    .from("compras_fornecimentos")
    .select("id, processo_id, cancelamento_valor, devolucao_recebida_em, cancelamento_desfecho")
    .eq("id", dados.fornecimentoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!f || f.cancelamento_desfecho !== "devolucao") return { erro: "Devolução não encontrada." }
  if (f.devolucao_recebida_em) return { erro: "Esta devolução já foi encerrada." }
  const { data: proc } = await admin.from("compras_solicitacoes").select("codigo").eq("id", String(f.processo_id)).maybeSingle()
  const codigo = texto(proc?.codigo) ?? ""
  const cancelado = f.cancelamento_valor === null ? null : Number(f.cancelamento_valor)
  const jaRecebido = (await recebidoPorDevolucao([String(f.id)])).get(String(f.id)) ?? 0
  const faltava = cancelado === null ? null : Math.max(0, centavos(cancelado - jaRecebido))

  let valor: number
  let data = dados.data ?? hojeSP()
  if (dados.lancamentoId) {
    const { data: l } = await admin
      .from("banco_lancamentos")
      .select("id, data, valor, situacao")
      .eq("id", dados.lancamentoId)
      .eq("emp_proprietaria_id", emp)
      .maybeSingle()
    if (!l || l.situacao !== "pendente" || Number(l.valor) <= 0) return { erro: "Lançamento do extrato não encontrado ou já conciliado." }
    valor = centavos(Number(l.valor))
    data = String(l.data).slice(0, 10)
  } else {
    valor = centavos(Number(dados.valor ?? faltava ?? 0))
    if (!(valor > 0)) return { erro: "Informe quanto voltou." }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return { erro: "Data inválida." }
    if (data > hojeSP()) return { erro: "A data do recebimento não pode ser futura." }
  }

  const { data: rec, error: eRec } = await admin
    .from("compras_devolucoes_recebimentos")
    .insert({
      emp_proprietaria_id: emp,
      fornecimento_id: dados.fornecimentoId,
      valor,
      data,
      lancamento_id: dados.lancamentoId ?? null,
      obs: dados.obs,
      registrado_por_id: dados.usuarioId,
    })
    .select("id")
    .single()
  if (eRec || !rec) return { erro: `Não foi possível registrar o recebimento: ${eRec?.message ?? "sem retorno"}` }

  if (dados.lancamentoId) {
    const { data: l, error } = await admin
      .from("banco_lancamentos")
      .update({
        situacao: "conciliado",
        automatico: false,
        observacao: `Devolução da compra cancelada ${codigo}`.trim(),
        conciliado_em: new Date().toISOString(),
        conciliado_por: dados.usuarioId,
      })
      .eq("id", dados.lancamentoId)
      .eq("emp_proprietaria_id", emp)
      .eq("situacao", "pendente")
      .select("id")
    if (error || !l?.length) {
      await admin.from("compras_devolucoes_recebimentos").delete().eq("id", String(rec.id))
      return { erro: error ? `Não foi possível conciliar o lançamento: ${error.message}` : "Lançamento do extrato já conciliado." }
    }
  }

  const totalRecebido = centavos(jaRecebido + valor)
  const saldo = cancelado === null ? 0 : Math.max(0, centavos(cancelado - totalRecebido))
  const encerrada = cancelado === null || saldo <= 0.005
  if (encerrada) {
    const obsPadrao = dados.lancamentoId ? "Crédito conciliado no extrato." : null
    const { error } = await admin
      .from("compras_fornecimentos")
      .update({
        devolucao_recebida_em: new Date().toISOString(),
        devolucao_recebida_por_id: dados.usuarioId,
        devolucao_recebida_obs: dados.obs ?? obsPadrao,
        devolucao_lancamento_id: dados.lancamentoId ?? null,
      })
      .eq("id", dados.fornecimentoId)
    if (error) return { erro: `Não foi possível encerrar a devolução: ${error.message}` }
  }

  const ids = await ordensPagasDaDevolucao(String(f.processo_id), dados.fornecimentoId)
  if (ids.length) {
    const parte = encerrada
      ? `Devolução da compra cancelada recebida (${formatarMoeda(valor)}${jaRecebido > 0 ? `; ${formatarMoeda(totalRecebido)} no total` : ""})`
      : `Parte da devolução da compra cancelada recebida (${formatarMoeda(valor)}; faltam ${formatarMoeda(saldo)})`
    await registrarEvento(
      ids,
      "corrigida",
      dados.usuarioId,
      `${parte}${dados.lancamentoId ? " — conciliada no extrato" : ""}${dados.obs ? `: ${dados.obs}` : "."}`,
      { campo: "devolucao_recebida", lancamento: dados.lancamentoId ?? null, valor }
    )
  }
  return { encerrada, saldo }
}

/**
 * O que falta da devolução não vai voltar (taxa retida, fornecedor não
 * devolveu): a diferença é dada como perda, com o motivo, e a devolução se
 * encerra.
 */
export async function encerrarDevolucaoComPerda(dados: { fornecimentoId: string; motivo: string; usuarioId: string }): Promise<{ erro?: string; perda?: number }> {
  const motivo = dados.motivo.trim()
  if (!motivo) return { erro: "Informe por que a diferença não vai voltar." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: f } = await admin
    .from("compras_fornecimentos")
    .select("id, processo_id, cancelamento_valor, devolucao_recebida_em, cancelamento_desfecho")
    .eq("id", dados.fornecimentoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!f || f.cancelamento_desfecho !== "devolucao") return { erro: "Devolução não encontrada." }
  if (f.devolucao_recebida_em) return { erro: "Esta devolução já foi encerrada." }
  const cancelado = Number(f.cancelamento_valor ?? 0)
  const recebido = (await recebidoPorDevolucao([String(f.id)])).get(String(f.id)) ?? 0
  const perda = Math.max(0, centavos(cancelado - recebido))
  if (perda <= 0) return { erro: "Não há diferença a dar como perda." }
  const resumo = recebido > 0 ? `Recebido ${formatarMoeda(recebido)}; ${formatarMoeda(perda)} dados como perda: ${motivo}` : `Nada voltou; ${formatarMoeda(perda)} dados como perda: ${motivo}`
  const { error } = await admin
    .from("compras_fornecimentos")
    .update({
      devolucao_perda_valor: perda,
      devolucao_perda_obs: motivo,
      devolucao_recebida_em: new Date().toISOString(),
      devolucao_recebida_por_id: dados.usuarioId,
      devolucao_recebida_obs: resumo,
    })
    .eq("id", dados.fornecimentoId)
    .is("devolucao_recebida_em", null)
  if (error) return { erro: `Não foi possível encerrar a devolução: ${error.message}` }
  const ids = await ordensPagasDaDevolucao(String(f.processo_id), dados.fornecimentoId)
  if (ids.length) {
    await registrarEvento(ids, "corrigida", dados.usuarioId, `Devolução da compra cancelada encerrada com perda. ${resumo}`, {
      campo: "devolucao_perda",
      valor: perda,
    })
  }
  return { perda }
}

/** O fornecedor foi cobrado pela devolução: o aviso de parada recomeça a contar desta data. */
export async function registrarCobrancaDevolucao(dados: { fornecimentoId: string; data: string; obs: string | null }): Promise<{ erro?: string }> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.data)) return { erro: "Data inválida." }
  if (dados.data > hojeSP()) return { erro: "A data da cobrança não pode ser futura." }
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("compras_fornecimentos")
    .update({ devolucao_cobrada_em: dados.data, devolucao_cobranca_obs: dados.obs })
    .eq("id", dados.fornecimentoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("cancelamento_desfecho", "devolucao")
    .is("devolucao_recebida_em", null)
    .select("id")
  if (error) return { erro: `Não foi possível registrar a cobrança: ${error.message}` }
  if (!data?.length) return { erro: "Devolução não encontrada ou já encerrada." }
  return {}
}

/**
 * A conciliação do lançamento foi desfeita: o recebimento dele sai, e a
 * devolução volta a ser esperada (sem a perda, que dependia do recebido).
 */
export async function reabrirDevolucaoDoLancamento(lancamentoId: string): Promise<void> {
  const admin = await createAdminClient()
  const { data: recs } = await admin.from("compras_devolucoes_recebimentos").select("fornecimento_id").eq("lancamento_id", lancamentoId)
  const fornecimentos = [...new Set((recs ?? []).map((r) => String(r.fornecimento_id)))]
  if (fornecimentos.length) await admin.from("compras_devolucoes_recebimentos").delete().eq("lancamento_id", lancamentoId)
  const reabrir = {
    devolucao_recebida_em: null,
    devolucao_recebida_por_id: null,
    devolucao_recebida_obs: null,
    devolucao_lancamento_id: null,
    devolucao_perda_valor: null,
    devolucao_perda_obs: null,
  }
  // Antes de 15/11 (sem a tabela de recebimentos), só a coluna no fornecimento.
  await admin.from("compras_fornecimentos").update(reabrir).eq("devolucao_lancamento_id", lancamentoId)
  if (fornecimentos.length) await admin.from("compras_fornecimentos").update(reabrir).in("id", fornecimentos)
}

/** Crédito vencido sem uso: sai da lista (fica a observação). */
export async function darCreditoComoPerdido(fornecimentoId: string, usuarioId: string): Promise<{ erro?: string }> {
  return marcarCreditoUsado(fornecimentoId, "Vencido sem uso — crédito perdido.", usuarioId)
}

// ── Desfazer o cancelamento (15/11/2026) ─────────────────────────────────────

/** Prefixo do motivo que registrarCancelamentoCompra grava nas ordens que cancela. */
const PREFIXO_MOTIVO = "Compra cancelada pelo vendedor em"

/**
 * Cancelamento registrado por engano: a compra volta a ser uma compra normal.
 * Recusa se o crédito já foi usado (abatido ou marcado) ou se a devolução já
 * chegou — esses passos se desfazem primeiro. As ordens canceladas por ele
 * voltam para "Em autorização" (a autorização é pedida de novo); nas pagas, o
 * comprovante do cancelamento sai do lugar da nota.
 */
export async function desfazerCancelamentoCompra(dados: {
  processoId: string
  fornecimentoId: string
  motivo: string
  usuarioId: string
}): Promise<{ erro?: string; avisos?: string[] }> {
  if (!dados.motivo.trim()) return { erro: "Informe por que o cancelamento está sendo desfeito." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: f } = await admin
    .from("compras_fornecimentos")
    .select(
      "id, processo_id, fornecedor_id, nota_fiscal_url, nota_a_receber, ordem_pagamento_id, cancelamento_desfecho, cancelamento_valor, cancelamento_parcial, cancelamento_ordem_reduzida_id, cancelamento_comprovante_url, credito_usado_em, credito_usado_obs, devolucao_recebida_em, devolucao_recebida_obs"
    )
    .eq("id", dados.fornecimentoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!f || f.processo_id !== dados.processoId) return { erro: "Fornecimento não encontrado neste processo." }
  if (!f.cancelamento_desfecho) return { erro: "Esta compra não está cancelada." }

  if (f.cancelamento_desfecho === "credito") {
    const usado = (await usadoPorCredito([String(f.id)])).get(String(f.id)) ?? 0
    if (usado > 0.005) {
      return { erro: `O crédito já foi abatido em compra nova (${formatarMoeda(usado)}). Cancele antes a ordem que o usou.` }
    }
    if (f.credito_usado_em && !String(f.credito_usado_obs ?? "").startsWith("Abatido na ordem")) {
      return { erro: `O crédito já foi dado como usado (${texto(f.credito_usado_obs) ?? "sem observação"}).` }
    }
  }
  if (f.cancelamento_desfecho === "devolucao" && f.devolucao_recebida_em && !String(f.devolucao_recebida_obs ?? "").startsWith("Nada a devolver")) {
    return { erro: "A devolução já foi recebida. Desfaça antes a conciliação (ou a marcação) da devolução no Financeiro." }
  }
  if (f.cancelamento_desfecho === "devolucao" && ((await recebidoPorDevolucao([String(f.id)])).get(String(f.id)) ?? 0) > 0.005) {
    return { erro: "Parte da devolução já foi recebida. Desfaça antes a conciliação desse recebimento no Financeiro." }
  }

  const { data: emp_ } = f.fornecedor_id
    ? await admin.from("empresa").select("marketplace").eq("id", String(f.fornecedor_id)).maybeSingle()
    : { data: null }
  const { error } = await admin
    .from("compras_fornecimentos")
    .update({
      cancelamento_desfecho: null,
      cancelamento_valor: null,
      cancelamento_data: null,
      cancelamento_obs: null,
      cancelamento_comprovante_url: null,
      cancelado_em: null,
      cancelado_por_id: null,
      credito_validade: null,
      credito_usado_em: null,
      credito_usado_por_id: null,
      credito_usado_obs: null,
      devolucao_recebida_em: null,
      devolucao_recebida_por_id: null,
      devolucao_recebida_obs: null,
      devolucao_lancamento_id: null,
      devolucao_perda_valor: null,
      devolucao_perda_obs: null,
      devolucao_cobrada_em: null,
      devolucao_cobranca_obs: null,
      cancelamento_parcial: false,
      cancelamento_ordem_reduzida_id: null,
      // Marketplace sem nota volta a esperar a nota do vendedor (a parcial não mexeu nisso).
      nota_a_receber: f.cancelamento_parcial === true ? f.nota_a_receber === true : emp_?.marketplace === true && !texto(f.nota_fiscal_url),
      updated_at: new Date().toISOString(),
    })
    .eq("id", dados.fornecimentoId)
  if (error) return { erro: `Não foi possível desfazer o cancelamento: ${error.message}` }

  // Parcial que reduziu uma ordem em aberto: o valor volta para ela.
  const avisosParcial: string[] = []
  if (f.cancelamento_parcial === true && f.cancelamento_ordem_reduzida_id) {
    const { data: o } = await admin
      .from("ordens_pagamento")
      .select("id, codigo, situacao, valor_inicial_cobranca")
      .eq("id", String(f.cancelamento_ordem_reduzida_id))
      .maybeSingle()
    if (o && !ENCERRADAS.includes(String(o.situacao))) {
      const antes = Number(o.valor_inicial_cobranca ?? 0)
      const depois = centavos(antes + Number(f.cancelamento_valor ?? 0))
      await admin.from("ordens_pagamento").update({ valor_inicial_cobranca: depois }).eq("id", String(o.id))
      await registrarEvento(String(o.id), "corrigida", dados.usuarioId, `Cancelamento parcial da compra desfeito: ${dados.motivo.trim()} Valor da ordem volta de ${formatarMoeda(antes)} para ${formatarMoeda(depois)}.`, {
        campo: "valor_inicial_cobranca",
        antes,
        depois,
      })
    } else if (o) {
      avisosParcial.push(`A ordem ${texto(o.codigo) ?? ""} já está ${String(o.situacao)}: o valor cancelado não voltou para ela — ajuste pelo Financeiro.`)
    }
  }

  const comprovante = texto(f.cancelamento_comprovante_url)
  const { data: ordens } = await admin
    .from("ordens_pagamento")
    .select("id, codigo, situacao, arquivo_nota_fiscal, fornecimento_id, cancelamento_motivo")
    .eq("emp_proprietaria_id", emp)
    .eq("processo_compra_id", dados.processoId)
    .not("excluido", "is", true)
  const doFornecimento = (ordens ?? []).filter(
    (o) => o.fornecimento_id === dados.fornecimentoId || (f.ordem_pagamento_id && o.id === f.ordem_pagamento_id)
  )
  const avisos: string[] = [...avisosParcial]
  const texto_ = `Cancelamento da compra pelo vendedor desfeito: ${dados.motivo.trim()}`
  for (const o of doFornecimento) {
    if (o.situacao === "Cancelada" && String(o.cancelamento_motivo ?? "").startsWith(PREFIXO_MOTIVO)) {
      const r = await alterarSituacaoOrdem(String(o.id), dados.usuarioId, "Em autorização", texto_)
      if (r.erro) avisos.push(`Ordem ${texto(o.codigo) ?? ""}: ${r.erro}`)
      continue
    }
    if (comprovante && o.arquivo_nota_fiscal === comprovante) {
      await admin.from("ordens_pagamento").update({ arquivo_nota_fiscal: null }).eq("id", String(o.id))
    }
    await registrarEvento(String(o.id), "corrigida", dados.usuarioId, texto_, {
      campo: "cancelamento_compra_desfeito",
      ...(comprovante && o.arquivo_nota_fiscal === comprovante ? { antes: comprovante, depois: null } : {}),
    })
  }
  if (comprovante) await admin.storage.from("compras").remove([comprovante]).catch(() => null)
  return avisos.length ? { avisos } : {}
}

// ── Na ficha do fornecedor (15/11/2026) ──────────────────────────────────────

export type CancelamentoNaFicha = {
  fornecimentoId: string
  processoId: string
  codigo: string | null
  produto: string | null
  desfecho: DesfechoCancelamento
  valor: number | null
  data: string | null
  /** Crédito: saldo em aberto (0 quando usado, perdido ou vencido). */
  saldo: number
  validade: string | null
  /** Rótulo da situação: em aberto, usado, perdido, vencido; a receber, recebida. */
  situacao: string
  /** Crédito: onde foi abatido. */
  usos: { processoId: string | null; codigo: string | null; ordemId: string | null; ordemCodigo: string | null; valor: number; data: string; desfeito: boolean }[]
  devolucaoRecebidaEm: string | null
  devolucaoObs: string | null
}

/** Compras deste fornecedor (marketplace ou vendedor) canceladas pelo vendedor, com o crédito e os usos. */
export async function cancelamentosDoFornecedor(fornecedorId: string): Promise<CancelamentoNaFicha[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("compras_fornecimentos")
    .select(
      "id, processo_id, cancelamento_desfecho, cancelamento_valor, cancelamento_data, credito_validade, credito_usado_em, credito_usado_obs, devolucao_recebida_em, devolucao_recebida_obs, devolucao_perda_valor"
    )
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("cancelamento_desfecho", "is", null)
    .or(`fornecedor_id.eq.${fornecedorId},vendedor_id.eq.${fornecedorId}`)
    .order("cancelamento_data", { ascending: false })
    .limit(200)
  if (error || !data?.length) return []
  const ids = data.map((c) => String(c.id))
  const { data: usosBrutos } = await admin
    .from("compras_creditos_usos")
    .select("credito_fornecimento_id, processo_id, ordem_id, valor, created_at, desfeito_em")
    .in("credito_fornecimento_id", ids)
    .order("created_at", { ascending: true })
  const usos = usosBrutos ?? []
  const recebidoDev = await recebidoPorDevolucao(data.filter((c) => c.cancelamento_desfecho === "devolucao").map((c) => String(c.id)))
  const procIds = [...new Set([...data.map((c) => String(c.processo_id)), ...usos.map((u) => texto(u.processo_id)).filter((v): v is string => !!v)])]
  const ordemIds = [...new Set(usos.map((u) => texto(u.ordem_id)).filter((v): v is string => !!v))]
  const [procs, ordens] = await Promise.all([
    admin.from("compras_solicitacoes").select("id, codigo, solicitacao_produto").in("id", procIds),
    ordemIds.length ? admin.from("ordens_pagamento").select("id, codigo").in("id", ordemIds) : Promise.resolve({ data: [] as { id: string; codigo: string | null }[] }),
  ])
  const proc = new Map((procs.data ?? []).map((p) => [String(p.id), p]))
  const ordem = new Map((ordens.data ?? []).map((o) => [String(o.id), texto(o.codigo)]))
  const hoje = hojeSP()
  return data.map((c) => {
    const p = proc.get(String(c.processo_id))
    const meus = usos.filter((u) => String(u.credito_fornecimento_id) === String(c.id))
    const usado = centavos(meus.filter((u) => !u.desfeito_em).reduce((s, u) => s + Number(u.valor ?? 0), 0))
    const valor = c.cancelamento_valor === null ? null : Number(c.cancelamento_valor)
    const desfecho = c.cancelamento_desfecho as DesfechoCancelamento
    const validade = texto(c.credito_validade)
    const vencido = Boolean(validade && validade < hoje)
    const perdido = String(c.credito_usado_obs ?? "").startsWith("Vencido sem uso")
    const saldoBruto = centavos((valor ?? 0) - usado)
    const fechado = Boolean(c.credito_usado_em)
    const situacao =
      desfecho === "devolucao"
        ? c.devolucao_recebida_em
          ? Number(c.devolucao_perda_valor ?? 0) > 0
            ? `Devolução encerrada (${formatarMoeda(Number(c.devolucao_perda_valor))} perdidos)`
            : "Devolução recebida"
          : (recebidoDev.get(String(c.id)) ?? 0) > 0
            ? `Devolução parcial (${formatarMoeda(recebidoDev.get(String(c.id)) ?? 0)} recebidos)`
            : "Devolução a receber"
        : perdido
          ? "Crédito perdido"
          : fechado
            ? "Crédito usado"
            : vencido
              ? "Crédito vencido"
              : "Crédito em aberto"
    return {
      fornecimentoId: String(c.id),
      processoId: String(c.processo_id),
      codigo: texto(p?.codigo),
      produto: texto(p?.solicitacao_produto),
      desfecho,
      valor,
      data: texto(c.cancelamento_data),
      saldo: desfecho === "credito" && !fechado && !vencido ? Math.max(0, saldoBruto) : 0,
      validade,
      situacao,
      usos: meus.map((u) => ({
        processoId: texto(u.processo_id),
        codigo: u.processo_id ? texto(proc.get(String(u.processo_id))?.codigo) : null,
        ordemId: texto(u.ordem_id),
        ordemCodigo: u.ordem_id ? (ordem.get(String(u.ordem_id)) ?? null) : null,
        valor: Number(u.valor ?? 0),
        data: String(u.created_at).slice(0, 10),
        desfeito: Boolean(u.desfeito_em),
      })),
      devolucaoRecebidaEm: texto(c.devolucao_recebida_em),
      devolucaoObs: texto(c.devolucao_recebida_obs) ?? (fechado && !perdido ? texto(c.credito_usado_obs) : null),
    }
  })
}

// ── Saldo com fornecedores numa data, para a contabilidade (15/11/2026) ──────

export type SaldoComFornecedor = {
  tipo: "Crédito" | "Devolução"
  fornecedor: string
  documento: string | null
  codigo: string | null
  produto: string | null
  /** Data do cancelamento. */
  data: string | null
  valorCancelado: number
  /** Crédito: abatido em compras até a data; devolução: recebido até a data. */
  movimentado: number
  saldo: number
  validade: string | null
  situacao: string
}

/** Data (São Paulo) de um timestamptz. */
function dataSP(ts: string | null | undefined): string | null {
  if (!ts) return null
  return new Date(ts).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
}

/**
 * Créditos com fornecedores e devoluções a receber de compras canceladas pelo
 * vendedor que estavam em aberto no fim do dia `ate` — o que a entidade tinha
 * a receber (em dinheiro ou em compras). Vale para datas passadas: usos,
 * recebimentos e encerramentos depois da data não contam.
 */
export async function saldosComFornecedoresEm(ate: string): Promise<SaldoComFornecedor[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("compras_fornecimentos")
    .select(
      "id, processo_id, fornecedor_id, vendedor_id, cancelamento_desfecho, cancelamento_valor, cancelamento_data, credito_validade, credito_usado_em, credito_usado_obs, devolucao_recebida_em, devolucao_recebida_obs"
    )
    .eq("emp_proprietaria_id", emp)
    .not("cancelamento_desfecho", "is", null)
    .lte("cancelamento_data", ate)
    .order("cancelamento_data", { ascending: true })
    .limit(1000)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler os créditos e devoluções: ${error.message}`)
  }
  // Fechados na própria compra (parte abatida numa ordem ainda não paga, nada a devolver) não são um valor a receber.
  const linhas = (data ?? []).filter((f) => {
    const obs = String((f.cancelamento_desfecho === "credito" ? f.credito_usado_obs : f.devolucao_recebida_obs) ?? "")
    return !obs.startsWith("Abatido na ordem") && !obs.startsWith("Nada a devolver")
  })
  if (!linhas.length) return []
  const ids = linhas.map((f) => String(f.id))
  const idsDe = (k: "processo_id" | "fornecedor_id" | "vendedor_id") => [...new Set(linhas.map((l) => texto(l[k])).filter((v): v is string => !!v))]
  const [usos, recs, procs, empresas] = await Promise.all([
    admin.from("compras_creditos_usos").select("credito_fornecimento_id, valor, created_at, desfeito_em").in("credito_fornecimento_id", ids),
    admin.from("compras_devolucoes_recebimentos").select("fornecimento_id, valor, data").in("fornecimento_id", ids).lte("data", ate),
    admin.from("compras_solicitacoes").select("id, codigo, solicitacao_produto").in("id", idsDe("processo_id")),
    admin.from("empresa").select("id, nome_fantasia, nome_razao, cnpj_cpf").in("id", [...idsDe("fornecedor_id"), ...idsDe("vendedor_id")]),
  ])
  const proc = new Map((procs.data ?? []).map((p) => [String(p.id), p]))
  const empresa = new Map((empresas.data ?? []).map((e) => [String(e.id), e]))
  const nomeDe = (id: unknown) => {
    const e = id ? empresa.get(String(id)) : undefined
    return e ? (texto(e.nome_fantasia) ?? texto(e.nome_razao)) : null
  }
  const saida: SaldoComFornecedor[] = []
  for (const f of linhas) {
    const valor = Number(f.cancelamento_valor ?? 0)
    if (!(valor > 0)) continue
    const credito = f.cancelamento_desfecho === "credito"
    let movimentado: number
    let situacao: string
    if (credito) {
      // Marcado como usado ou dado como perdido até a data: não há mais saldo.
      const fechadoEm = dataSP(texto(f.credito_usado_em))
      if (fechadoEm && fechadoEm <= ate) continue
      movimentado = centavos(
        (usos.data ?? [])
          .filter((u) => String(u.credito_fornecimento_id) === String(f.id))
          .filter((u) => (dataSP(texto(u.created_at)) ?? "") <= ate && (!u.desfeito_em || (dataSP(texto(u.desfeito_em)) ?? "") > ate))
          .reduce((s, u) => s + Number(u.valor ?? 0), 0)
      )
      const validade = texto(f.credito_validade)
      situacao = validade && validade < ate ? `Vencido em ${formatarData(validade)}, sem uso` : movimentado > 0 ? "Usado em parte" : "Em aberto"
    } else {
      const encerradaEm = dataSP(texto(f.devolucao_recebida_em))
      if (encerradaEm && encerradaEm <= ate) continue
      movimentado = centavos(
        (recs.data ?? []).filter((r) => String(r.fornecimento_id) === String(f.id)).reduce((s, r) => s + Number(r.valor ?? 0), 0)
      )
      situacao = movimentado > 0 ? "Recebida em parte" : "A receber"
    }
    const saldo = centavos(valor - movimentado)
    if (saldo <= 0.005) continue
    const marketplace = nomeDe(f.fornecedor_id)
    const vendedor = nomeDe(f.vendedor_id)
    const doc = f.vendedor_id ? empresa.get(String(f.vendedor_id)) : empresa.get(String(f.fornecedor_id))
    const p = proc.get(String(f.processo_id))
    saida.push({
      tipo: credito ? "Crédito" : "Devolução",
      fornecedor: vendedor && marketplace ? `${vendedor} (via ${marketplace})` : (vendedor ?? marketplace ?? "(fornecedor)"),
      documento: texto(doc?.cnpj_cpf),
      codigo: texto(p?.codigo),
      produto: texto(p?.solicitacao_produto),
      data: texto(f.cancelamento_data),
      valorCancelado: valor,
      movimentado,
      saldo,
      validade: credito ? texto(f.credito_validade) : null,
      situacao,
    })
  }
  return saida
}
