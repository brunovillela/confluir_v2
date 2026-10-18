import "server-only"

import { janelasOnline } from "@/lib/db/votacao-sem-link"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * O que está em uso agora e pesa na escolha do estado de uma parte (avisos
 * nos cartões da Área do associado). Leituras pequenas; quem chama trata o
 * erro como "sem aviso" — a página nunca cai por causa delas.
 */

/** Cobranças Pix em aberto: o QR delas só aparece em Contribuição. */
export async function cobrancasPixEmAberto(): Promise<number> {
  const admin = await createAdminClient()
  const { count, error } = await admin
    .from("filiacao_cobrancas")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("situacao", "aberta")
  return error ? 0 : (count ?? 0)
}

/** Rodadas com o voto pela internet aberto agora (apuração não encerrada). */
export async function votacoesOnlineAbertas(): Promise<number> {
  const admin = await createAdminClient()
  const janelas = await janelasOnline({ client: admin, emp: await tenantAtual() })
  return janelas.filter((j) => j.aberta).length
}
