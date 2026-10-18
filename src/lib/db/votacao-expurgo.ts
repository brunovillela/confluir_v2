import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { OPCOES_RETER_CONTATOS_DIAS, RETER_CONTATOS_DIAS_PADRAO } from "@/lib/assembleias-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Expurgo dos contatos dos aptos depois da apuração (RIPD da votação, V4).
 *
 * Quem faz é o banco: votacao_expurgar_contatos() (migração
 * 20261018181729_votacao_pos_apuracao) pega as rodadas cujas assembleias
 * estão TODAS com a apuração encerrada há contatos_reter_dias, anula e-mail
 * de contato, telefone, chat do Telegram, nascimento informado e o e-mail do
 * aviso dos aptos (nome, CPF, hora_voto e comprovante ficam), apaga as
 * verificações de e-mail e as confirmações do Telegram dessas pessoas e
 * registra cada rodada em votacao_expurgo_contatos. O cron /api/votacao/tick
 * chama a cada volta; a função é idempotente (marca a rodada).
 */

export type ExpurgoRodada = {
  rodadaId: string
  aptosLimpos: number
  emailsVerificadosApagados: number
  telegramConfirmacoesApagadas: number
}

/** Roda o expurgo de todos os tenants (cron, service client). */
export async function expurgarContatosVencidos(
  client: SupabaseClient,
  limite = 20
): Promise<{ rodadas: ExpurgoRodada[]; erro?: string }> {
  const { data, error } = await client.rpc("votacao_expurgar_contatos", { p_limite: limite })
  if (error) return { rodadas: [], erro: `expurgo de contatos: ${error.message}` }
  const linhas = (data ?? []) as {
    rod_assembleia_id: string
    aptos_limpos: number
    emails_verificados_apagados: number
    telegram_confirmacoes_apagadas: number
  }[]
  return {
    rodadas: linhas.map((l) => ({
      rodadaId: String(l.rod_assembleia_id),
      aptosLimpos: l.aptos_limpos,
      emailsVerificadosApagados: l.emails_verificados_apagados,
      telegramConfirmacoesApagadas: l.telegram_confirmacoes_apagadas,
    })),
  }
}

export type GuardaContatos = {
  dias: number
  /** Quando os contatos foram apagados (ISO); null se ainda não. */
  expurgadosEm: string | null
  /** Quando serão apagados (ISO): só com todas as assembleias apuradas. */
  previstoPara: string | null
}

export async function guardaContatosDaRodada(rodadaId: string): Promise<GuardaContatos> {
  const client = await createAdminClient()
  const emp = await tenantAtual()
  const [{ data: rod }, { data: ass }] = await Promise.all([
    client
      .from("voto_rod_assembleias")
      .select("contatos_reter_dias, contatos_expurgados_em")
      .eq("id", rodadaId)
      .eq("emp_proprietaria_id", emp)
      .maybeSingle(),
    client
      .from("voto_assembleias")
      .select("apuracao_encerrada, apuracao_encerrada_em")
      .eq("rod_assembleia_id", rodadaId)
      .eq("emp_proprietaria_id", emp),
  ])
  const dias =
    typeof rod?.contatos_reter_dias === "number" ? rod.contatos_reter_dias : RETER_CONTATOS_DIAS_PADRAO
  const expurgadosEm = typeof rod?.contatos_expurgados_em === "string" ? rod.contatos_expurgados_em : null
  let previstoPara: string | null = null
  const lista = ass ?? []
  if (!expurgadosEm && lista.length > 0 && lista.every((a) => a.apuracao_encerrada === true && a.apuracao_encerrada_em)) {
    const ultimo = Math.max(...lista.map((a) => new Date(String(a.apuracao_encerrada_em)).getTime()))
    previstoPara = new Date(ultimo + dias * 86_400_000).toISOString()
  }
  return { dias, expurgadosEm, previstoPara }
}

export async function configurarGuardaContatos(rodadaId: string, dias: number): Promise<{ erro?: string }> {
  if (!(OPCOES_RETER_CONTATOS_DIAS as readonly number[]).includes(dias)) {
    return { erro: "Escolha um dos prazos oferecidos." }
  }
  const client = await createAdminClient()
  const { error } = await client
    .from("voto_rod_assembleias")
    .update({ contatos_reter_dias: dias })
    .eq("id", rodadaId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  return {}
}
