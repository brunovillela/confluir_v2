import "server-only"

import { esquemaAusente } from "@/lib/db/comum"
import { REGRA_PAGAMENTO_VAZIA, type RegraPagamentoFerias } from "@/lib/ferias-pagamento"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Regra de pagamento das férias da entidade (pessoal_folha_config, migração
 * 20261106172544): o aviso de férias usa só ela, nunca uma regra de lei fixa.
 */
export async function regraPagamentoFerias(): Promise<RegraPagamentoFerias> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_folha_config")
    .select("ferias_pagamento_dias, ferias_pagamento_dias_uteis, ferias_pagamento_descricao, ferias_pagamento_fundamento")
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return REGRA_PAGAMENTO_VAZIA
    throw new Error(`Falha ao ler a regra de pagamento das férias: ${error.message}`)
  }
  if (!data) return REGRA_PAGAMENTO_VAZIA
  return {
    dias: data.ferias_pagamento_dias == null ? null : Number(data.ferias_pagamento_dias),
    uteis: data.ferias_pagamento_dias_uteis === true,
    descricao: data.ferias_pagamento_descricao?.trim() || null,
    fundamento: data.ferias_pagamento_fundamento?.trim() || null,
  }
}

export async function salvarRegraPagamentoFerias(r: RegraPagamentoFerias): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_folha_config").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      ferias_pagamento_dias: r.dias,
      ferias_pagamento_dias_uteis: r.uteis,
      ferias_pagamento_descricao: r.descricao,
      ferias_pagamento_fundamento: r.fundamento,
    },
    { onConflict: "emp_proprietaria_id" }
  )
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  return {}
}
