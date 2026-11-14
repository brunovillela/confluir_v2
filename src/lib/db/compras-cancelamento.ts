import "server-only"

import { esquemaAusente, texto } from "@/lib/db/comum"
import { cancelarOrdem, registrarEvento } from "@/lib/db/ordens-ciclo"
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

export async function registrarCancelamentoCompra(dados: {
  processoId: string
  fornecimentoId: string
  desfecho: DesfechoCancelamento
  valor: number | null
  data: string
  obs: string | null
  comprovante: string | null
  usuarioId: string
}): Promise<{ erro?: string; avisos?: string[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: f } = await admin
    .from("compras_fornecimentos")
    .select("id, processo_id, valor, nota_fiscal_url, ordem_pagamento_id, cancelamento_desfecho")
    .eq("id", dados.fornecimentoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!f || f.processo_id !== dados.processoId) return { erro: "Fornecimento não encontrado neste processo." }
  if (f.cancelamento_desfecho) return { erro: "O cancelamento desta compra já foi registrado." }

  const { error } = await admin
    .from("compras_fornecimentos")
    .update({
      cancelamento_desfecho: dados.desfecho,
      cancelamento_valor: dados.valor,
      cancelamento_data: dados.data,
      cancelamento_obs: dados.obs,
      cancelamento_comprovante_url: dados.comprovante,
      cancelado_em: new Date().toISOString(),
      cancelado_por_id: dados.usuarioId,
      nota_a_receber: false,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dados.fornecimentoId)
  if (error) {
    if (esquemaAusente(error)) return { erro: "O cancelamento de compra ainda não está disponível." }
    return { erro: `Não foi possível registrar o cancelamento: ${error.message}` }
  }

  const valorTxt = dados.valor !== null ? formatarMoeda(dados.valor) : "valor não informado"
  const resumo =
    dados.desfecho === "credito"
      ? `Compra cancelada pelo vendedor em ${formatarData(dados.data)} — virou crédito para compras futuras (${valorTxt}).`
      : `Compra cancelada pelo vendedor em ${formatarData(dados.data)} — dinheiro devolvido (${valorTxt}).`
  const motivo = [resumo, dados.obs].filter(Boolean).join(" ")

  // Ordens do fornecimento: as com fornecimento_id e a principal.
  const { data: ordens } = await admin
    .from("ordens_pagamento")
    .select("id, codigo, situacao, arquivo_nota_fiscal, fornecimento_id")
    .eq("emp_proprietaria_id", emp)
    .eq("processo_compra_id", dados.processoId)
    .not("excluido", "is", true)
  const doFornecimento = (ordens ?? []).filter(
    (o) => o.fornecimento_id === dados.fornecimentoId || (f.ordem_pagamento_id && o.id === f.ordem_pagamento_id)
  )
  const avisos: string[] = []
  for (const o of doFornecimento) {
    const situacao = texto(o.situacao) ?? ""
    if (situacao === "Cancelada" || situacao === "Estornado") continue
    if (!ENCERRADAS.includes(situacao)) {
      const r = await cancelarOrdem(String(o.id), dados.usuarioId, motivo)
      if (r.erro) avisos.push(`Ordem ${texto(o.codigo) ?? ""}: ${r.erro}`)
      continue
    }
    // Paga: o comprovante do cancelamento é o documento da despesa.
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
  return avisos.length ? { avisos } : {}
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
  data: string | null
  obs: string | null
}

/** Créditos de compras canceladas ainda não usados, mais antigos primeiro. */
export async function creditosEmAberto(): Promise<{ disponivel: boolean; itens: CreditoFornecedor[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("compras_fornecimentos")
    .select("id, processo_id, fornecedor_id, vendedor_id, cancelamento_valor, cancelamento_data, cancelamento_obs")
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
