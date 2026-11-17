import "server-only"

import { ATENDIMENTO_ABERTO } from "@/lib/atendimento-constantes"
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

/**
 * Vagas da lista de espera oferecidas e ainda no prazo: a reserva está
 * guardada e só se confirma com a Hospedagem (e o portal) habilitada — pelo
 * portal ou pelo link do e-mail. Suspender ou desabilitar agora faz a vaga
 * vencer sem que o associado consiga confirmá-la.
 */
export async function vagasOferecidasEmAberto(): Promise<{ total: number; primeiraVence: string | null }> {
  const admin = await createAdminClient()
  const { data, count, error } = await admin
    .from("hospedagem_espera")
    .select("oferta_expira_em", { count: "exact" })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("situacao", "oferecida")
    .gt("oferta_expira_em", new Date().toISOString())
    .order("oferta_expira_em", { ascending: true })
    .limit(1)
  if (error) return { total: 0, primeiraVence: null }
  return { total: count ?? 0, primeiraVence: (data?.[0]?.oferta_expira_em as string | null) ?? null }
}

/**
 * Solicitações do Atendimento ainda abertas (aberta, em andamento ou
 * respondida): com o Atendimento desabilitado, o associado deixa de vê-las e
 * as respostas da equipe não chegam a ele — nem por e-mail.
 */
export async function atendimentosEmAberto(): Promise<number> {
  const admin = await createAdminClient()
  const { count, error } = await admin
    .from("portal_atendimentos")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", await tenantAtual())
    .in("situacao", ATENDIMENTO_ABERTO)
  return error ? 0 : (count ?? 0)
}

/** Rodadas com o voto pela internet aberto agora (apuração não encerrada). */
export async function votacoesOnlineAbertas(): Promise<number> {
  const admin = await createAdminClient()
  const janelas = await janelasOnline({ client: admin, emp: await tenantAtual() })
  return janelas.filter((j) => j.aberta).length
}
