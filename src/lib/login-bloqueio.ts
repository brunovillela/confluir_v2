import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * BLOQUEIO PROGRESSIVO POR CONTA (onda 1, S6).
 *
 * O Supabase limita tentativas por IP e o Turnstile barra robôs; isto cobre o
 * que sobrava: alguém testando senhas de UMA conta, devagar, de vários
 * lugares. Cada falha de senha conta para o identificador (e-mail ou CPF) no
 * tenant: 5 falhas seguidas → 15 min; 10 → 1 h. Um acerto zera. Falhas com
 * mais de 1 h de intervalo recomeçam a contagem.
 *
 * A mensagem é a mesma para conta existente ou não — o bloqueio não pode
 * virar um oráculo de quais contas existem. Tabela ausente ou erro de banco
 * não trancam ninguém (supabase/login-tentativas.sql).
 */

const JANELA_MS = 60 * 60 * 1000
const DEGRAUS = [
  { falhas: 10, minutos: 60 },
  { falhas: 5, minutos: 15 },
]

export function chaveDeLogin(tipo: "senha", identificador: string): string {
  return `${tipo}:${identificador.trim().toLowerCase()}`
}

function mensagem(minutos: number): string {
  return `Muitas tentativas de acesso. Aguarde ${minutos} minuto${minutos === 1 ? "" : "s"} e tente de novo.`
}

/** Mensagem de bloqueio em vigor para a chave, ou null quando pode tentar. */
export async function bloqueioAtivo(chave: string): Promise<string | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("login_tentativas")
    .select("bloqueado_ate")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("chave", chave)
    .maybeSingle()
  if (error || !data?.bloqueado_ate) return null
  const ate = new Date(String(data.bloqueado_ate)).getTime()
  if (ate <= Date.now()) return null
  return mensagem(Math.max(1, Math.ceil((ate - Date.now()) / 60000)))
}

/** Uma senha errada: conta e, nos degraus, bloqueia. */
export async function registrarFalhaLogin(chave: string): Promise<void> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("login_tentativas")
    .select("id, falhas, ultima_falha_em")
    .eq("emp_proprietaria_id", emp)
    .eq("chave", chave)
    .maybeSingle()
  const agora = Date.now()
  const ultima = data?.ultima_falha_em ? new Date(String(data.ultima_falha_em)).getTime() : 0
  const falhas = data && agora - ultima < JANELA_MS ? Number(data.falhas ?? 0) + 1 : 1
  const degrau = DEGRAUS.find((d) => falhas >= d.falhas)
  const bloqueado_ate = degrau ? new Date(agora + degrau.minutos * 60000).toISOString() : null
  const linha = { falhas, ultima_falha_em: new Date(agora).toISOString(), bloqueado_ate }
  if (data) {
    await admin.from("login_tentativas").update(linha).eq("id", data.id)
  } else {
    await admin.from("login_tentativas").insert({ emp_proprietaria_id: emp, chave, ...linha })
  }
}

/** Senha certa: a contagem recomeça do zero. */
export async function limparFalhasLogin(chave: string): Promise<void> {
  const admin = await createAdminClient()
  await admin
    .from("login_tentativas")
    .delete()
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("chave", chave)
}
