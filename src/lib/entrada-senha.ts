import "server-only"

import type { AuthError, User } from "@supabase/supabase-js"

import { descreveErroAuth } from "@/lib/contas"
import { mensagemDaRecusa } from "@/lib/entrada-senha-recusa"
import type { createClient } from "@/lib/supabase/server"

/**
 * Peças comuns às entradas por senha (painel, portal, hotel) — 06/11/2026.
 *
 * O caso que motivou: num aparelho novo, a pessoa via "Email ou senha
 * incorretos" e, ao recarregar a página, já estava dentro. A senha estava
 * certa: o primeiro envio abriu a sessão, e um segundo envio do mesmo
 * formulário (toque repetido enquanto o painel carregava) chegava com o token
 * do Turnstile já gasto — o Supabase recusava pelo captcha e a tela traduzia
 * QUALQUER recusa como senha errada (e ainda contava para o bloqueio).
 */

type Cliente = Awaited<ReturnType<typeof createClient>>

/**
 * A sessão aberta neste navegador, quando é da MESMA conta que está tentando
 * entrar. Aí o envio repetido segue para dentro, sem gastar outro token nem
 * pedir a senha ao Supabase de novo — quem tem a sessão já provou a senha.
 * Sem sessão, o getUser nem vai à rede.
 */
export async function sessaoDaMesmaConta(supabase: Cliente, email: string): Promise<User | null> {
  const { data } = await supabase.auth.getUser()
  const atual = data.user
  if (!atual?.email) return null
  return atual.email.trim().toLowerCase() === email.trim().toLowerCase() ? atual : null
}

/**
 * Recusa do Supabase que NÃO é senha errada: devolve a mensagem certa para a
 * tela (e registra o erro real no log). Devolve null quando é mesmo senha
 * errada — aí quem chama mostra o "incorretos" de sempre e conta a falha.
 * Captcha, limite de requisições e falha de rede não contam para o bloqueio.
 */
export function recusaQueNaoESenha(error: AuthError | null, onde: string): string | null {
  if (!error) return null
  const mensagem = mensagemDaRecusa(error)
  // O erro real vai para o log: é o que mostra, na Vercel, por que entrou "recusado".
  if (mensagem) console.error(`Entrada por senha recusada sem ser a senha (${onde}):`, descreveErroAuth(error))
  return mensagem
}
