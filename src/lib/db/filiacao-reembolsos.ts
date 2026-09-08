import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Reembolsos a filiados — o reembolso por participação (reunião, ato,
 * assembleia) que a entidade paga ao associado.
 *
 * Nasceu em `supabase/filiacao-lacunas-modelo.sql` (08/09): no sistema antigo
 * eram 1.848 registros com justificativa, projeto e ordem de pagamento, e
 * aqui só existiam as ordens — sem o elo com o filiado nem o porquê. A tela
 * do filiado lia "reembolsos" como ordens em favor do usuário, o que só
 * alcança quem tem login. Agora lê daqui.
 */

export type ReembolsoFiliado = {
  id: string
  data: string | null
  justificativa: string | null
  valor: number | null
  projeto: string | null
  ordem: {
    id: string
    codigo: string | null
    situacao: string | null
    valor_pago: number | null
    data_pagamento: string | null
  } | null
}

export type ConfigReembolso = {
  valorReembolso: number | null
  orcamentoMensal: number | null
  orcamentoLimite: boolean
}

/**
 * Os reembolsos de uma pessoa. Recebe todos os ids de cadastro da pessoa
 * (ela costuma ter um por vínculo) e devolve os mais recentes primeiro.
 */
export async function reembolsosDoFiliado(
  filiadoIds: string[],
  limite = 10
): Promise<{ total: number; ultimos: ReembolsoFiliado[]; totalPago: number }> {
  if (filiadoIds.length === 0) return { total: 0, ultimos: [], totalPago: 0 }
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data, error, count } = await admin
    .from("filiacao_reembolsos")
    .select(
      "id, data, justificativa, valor, projeto:projeto_id(descricao), ordem:ordem_pagamento_id(id, codigo, situacao, valor_pago, data_pagamento)",
      { count: "exact" }
    )
    .eq("emp_proprietaria_id", emp)
    .in("filiado_id", filiadoIds)
    .order("data", { ascending: false, nullsFirst: false })
    .limit(limite)
  if (error) {
    // Tabela ainda não criada neste ambiente: a tela mostra vazio, não erro.
    if (/does not exist|schema cache/i.test(error.message)) {
      return { total: 0, ultimos: [], totalPago: 0 }
    }
    throw new Error(`Falha ao ler reembolsos: ${error.message}`)
  }

  const ultimos: ReembolsoFiliado[] = (data ?? []).map((r) => {
    const projeto = r.projeto as { descricao: string | null } | { descricao: string | null }[] | null
    const ordem = r.ordem as ReembolsoFiliado["ordem"] | ReembolsoFiliado["ordem"][] | null
    return {
      id: r.id as string,
      data: (r.data as string | null) ?? null,
      justificativa: (r.justificativa as string | null) ?? null,
      valor: (r.valor as number | null) ?? null,
      projeto: (Array.isArray(projeto) ? projeto[0] : projeto)?.descricao ?? null,
      ordem: (Array.isArray(ordem) ? ordem[0] : ordem) ?? null,
    }
  })

  // Total pago: o que a ordem de pagamento diz que saiu, somado sobre todos.
  const { data: pagos } = await admin
    .from("filiacao_reembolsos")
    .select("ordem:ordem_pagamento_id(valor_pago, situacao)")
    .eq("emp_proprietaria_id", emp)
    .in("filiado_id", filiadoIds)
  let totalPago = 0
  for (const p of pagos ?? []) {
    const o = p.ordem as { valor_pago: number | null; situacao: string | null } | { valor_pago: number | null; situacao: string | null }[] | null
    const ordem = Array.isArray(o) ? o[0] : o
    if (ordem?.situacao === "Paga" && typeof ordem.valor_pago === "number") totalPago += ordem.valor_pago
  }

  return { total: count ?? ultimos.length, ultimos, totalPago }
}

/** A regra da entidade — quanto vale cada reembolso e o teto mensal. */
export async function configReembolso(): Promise<ConfigReembolso | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("filiacao_reembolsos_config")
    .select("valor_reembolso, orcamento_mensal, orcamento_limite")
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (error || !data) return null
  return {
    valorReembolso: (data.valor_reembolso as number | null) ?? null,
    orcamentoMensal: (data.orcamento_mensal as number | null) ?? null,
    orcamentoLimite: data.orcamento_limite === true,
  }
}
