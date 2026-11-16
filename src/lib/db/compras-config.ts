import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { PRAZO_COTACAO_PADRAO } from "@/lib/compras-prazo"
import { esquemaAusente } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Configuração de Aquisição da entidade (compras_config, 16/11/2026). Sem
 * linha gravada — ou antes da migração —, vale o padrão.
 */
export type ComprasConfig = {
  /** Dias úteis para iniciar a cotação; null = sem prazo. */
  prazoCotacao: number | null
}

export async function lerComprasConfig(amb: { client?: SupabaseClient; tenantId?: string } = {}): Promise<ComprasConfig> {
  const client = amb.client ?? (await createAdminClient())
  const tenantId = amb.tenantId ?? (await tenantAtual())
  const { data, error } = await client
    .from("compras_config")
    .select("cotacao_prazo_dias_uteis")
    .eq("emp_proprietaria_id", tenantId)
    .maybeSingle()
  if (error || !data) return { prazoCotacao: PRAZO_COTACAO_PADRAO }
  return { prazoCotacao: (data.cotacao_prazo_dias_uteis as number | null) ?? null }
}

export async function salvarPrazoCotacao(prazo: number | null, usuarioId: string): Promise<{ erro?: string }> {
  if (prazo !== null && (!Number.isInteger(prazo) || prazo < 1 || prazo > 60)) {
    return { erro: "O prazo vai de 1 a 60 dias úteis (ou deixe sem prazo)." }
  }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin
    .from("compras_config")
    .upsert(
      {
        emp_proprietaria_id: emp,
        cotacao_prazo_dias_uteis: prazo,
        atualizado_por_id: usuarioId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "emp_proprietaria_id" }
    )
  if (error) {
    if (esquemaAusente(error)) return { erro: "A configuração de Aquisição ainda não está disponível (migração pendente)." }
    return { erro: `Não foi possível salvar o prazo: ${error.message}` }
  }
  return {}
}
