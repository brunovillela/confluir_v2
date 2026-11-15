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
      credito_validade: dados.desfecho === "credito" ? (dados.creditoValidade ?? null) : null,
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

export type DevolucaoAReceber = {
  fornecimentoId: string
  processoId: string
  codigo: string | null
  produto: string | null
  fornecedor: string
  valor: number | null
  /** Data do cancelamento. */
  data: string | null
  dias: number
  /** Créditos pendentes do extrato com o mesmo valor (sugestão de conciliação). */
  sugestoes: { lancamentoId: string; data: string; descricao: string | null; valor: number }[]
}

function somarDiasIso(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Compras canceladas com devolução do dinheiro que ainda não voltou, com os
 * créditos do extrato que parecem ser ela (mesmo valor, a partir de 3 dias
 * antes do cancelamento).
 */
export async function devolucoesAReceber(): Promise<{ disponivel: boolean; itens: DevolucaoAReceber[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("compras_fornecimentos")
    .select("id, processo_id, fornecedor_id, vendedor_id, cancelamento_valor, cancelamento_data")
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
  const [procs, empresas, creditos] = await Promise.all([
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
  ])
  const proc = new Map((procs.data ?? []).map((p) => [String(p.id), p]))
  const nome = new Map((empresas.data ?? []).map((e) => [String(e.id), texto(e.nome_fantasia) ?? texto(e.nome_razao)]))
  return {
    disponivel: true,
    itens: linhas.map((l) => {
      const p = proc.get(String(l.processo_id))
      const marketplace = nome.get(String(l.fornecedor_id)) ?? null
      const vendedor = l.vendedor_id ? (nome.get(String(l.vendedor_id)) ?? null) : null
      const valor = l.cancelamento_valor === null ? null : Number(l.cancelamento_valor)
      const data = texto(l.cancelamento_data)
      const desde = somarDiasIso(data ?? hoje, -3)
      return {
        fornecimentoId: String(l.id),
        processoId: String(l.processo_id),
        codigo: texto(p?.codigo),
        produto: texto(p?.solicitacao_produto),
        fornecedor: vendedor && marketplace ? `${vendedor} (via ${marketplace})` : (vendedor ?? marketplace ?? "(fornecedor)"),
        valor,
        data,
        dias: data ? Math.max(0, diasEntre(data, hoje)) : 0,
        sugestoes:
          valor === null
            ? []
            : (creditos.data ?? [])
                .filter((c) => Math.abs(Number(c.valor) - valor) < 0.005 && String(c.data) >= desde)
                .slice(0, 3)
                .map((c) => ({
                  lancamentoId: String(c.id),
                  data: String(c.data).slice(0, 10),
                  descricao: texto(c.descricao),
                  valor: Number(c.valor),
                })),
      }
    }),
  }
}

/**
 * O dinheiro voltou. Com lancamentoId, o crédito do extrato fica conciliado
 * com a devolução; sem ele (estorno na fatura do cartão, outro caminho), só a
 * marcação com a observação.
 */
export async function receberDevolucao(dados: {
  fornecimentoId: string
  usuarioId: string
  obs: string | null
  lancamentoId?: string | null
}): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: f } = await admin
    .from("compras_fornecimentos")
    .select("id, processo_id, cancelamento_valor, devolucao_recebida_em, cancelamento_desfecho")
    .eq("id", dados.fornecimentoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!f || f.cancelamento_desfecho !== "devolucao") return { erro: "Devolução não encontrada." }
  if (f.devolucao_recebida_em) return { erro: "Esta devolução já foi recebida." }
  const { data: proc } = await admin.from("compras_solicitacoes").select("codigo").eq("id", String(f.processo_id)).maybeSingle()
  const codigo = texto(proc?.codigo) ?? ""

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
      .gt("valor", 0)
      .select("id")
    if (error) return { erro: `Não foi possível conciliar o lançamento: ${error.message}` }
    if (!l?.length) return { erro: "Lançamento do extrato não encontrado ou já conciliado." }
  }
  const { error } = await admin
    .from("compras_fornecimentos")
    .update({
      devolucao_recebida_em: new Date().toISOString(),
      devolucao_recebida_por_id: dados.usuarioId,
      devolucao_recebida_obs: dados.obs ?? (dados.lancamentoId ? "Crédito conciliado no extrato." : null),
      devolucao_lancamento_id: dados.lancamentoId ?? null,
    })
    .eq("id", dados.fornecimentoId)
  if (error) return { erro: `Não foi possível marcar a devolução: ${error.message}` }

  // Trilha nas ordens pagas da compra.
  const { data: ordens } = await admin
    .from("ordens_pagamento")
    .select("id, fornecimento_id")
    .eq("emp_proprietaria_id", emp)
    .eq("processo_compra_id", String(f.processo_id))
    .eq("situacao", "Paga")
  const ids = (ordens ?? [])
    .filter((o) => !o.fornecimento_id || o.fornecimento_id === dados.fornecimentoId)
    .map((o) => String(o.id))
  if (ids.length) {
    const valor = f.cancelamento_valor !== null ? formatarMoeda(Number(f.cancelamento_valor)) : "valor não informado"
    await registrarEvento(
      ids,
      "corrigida",
      dados.usuarioId,
      `Devolução da compra cancelada recebida (${valor})${dados.lancamentoId ? " — conciliada no extrato" : ""}${dados.obs ? `: ${dados.obs}` : "."}`,
      { campo: "devolucao_recebida", lancamento: dados.lancamentoId ?? null }
    )
  }
  return {}
}

/** A conciliação do lançamento foi desfeita: a devolução volta a ser esperada. */
export async function reabrirDevolucaoDoLancamento(lancamentoId: string): Promise<void> {
  const admin = await createAdminClient()
  await admin
    .from("compras_fornecimentos")
    .update({
      devolucao_recebida_em: null,
      devolucao_recebida_por_id: null,
      devolucao_recebida_obs: null,
      devolucao_lancamento_id: null,
    })
    .eq("devolucao_lancamento_id", lancamentoId)
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
      "id, processo_id, fornecedor_id, nota_fiscal_url, ordem_pagamento_id, cancelamento_desfecho, cancelamento_comprovante_url, credito_usado_em, credito_usado_obs, devolucao_recebida_em, devolucao_recebida_obs"
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
    if (f.credito_usado_em) {
      return { erro: `O crédito já foi dado como usado (${texto(f.credito_usado_obs) ?? "sem observação"}).` }
    }
  }
  if (f.cancelamento_desfecho === "devolucao" && f.devolucao_recebida_em && !String(f.devolucao_recebida_obs ?? "").startsWith("Nada a devolver")) {
    return { erro: "A devolução já foi recebida. Desfaça antes a conciliação (ou a marcação) da devolução no Financeiro." }
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
      // Marketplace sem nota volta a esperar a nota do vendedor.
      nota_a_receber: emp_?.marketplace === true && !texto(f.nota_fiscal_url),
      updated_at: new Date().toISOString(),
    })
    .eq("id", dados.fornecimentoId)
  if (error) return { erro: `Não foi possível desfazer o cancelamento: ${error.message}` }

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
  const avisos: string[] = []
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
      "id, processo_id, cancelamento_desfecho, cancelamento_valor, cancelamento_data, credito_validade, credito_usado_em, credito_usado_obs, devolucao_recebida_em, devolucao_recebida_obs"
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
          ? "Devolução recebida"
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
