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
  valor: number | null
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
        valor: l.cancelamento_valor === null ? null : Number(l.cancelamento_valor),
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
