import "server-only"

import { headers } from "next/headers"

/**
 * Lado do servidor do Turnstile (ver components/auth/turnstile.tsx).
 *
 * Duas camadas, ambas opcionais por variável de ambiente:
 *  - TURNSTILE_SECRET_KEY: a action confere o token com a Cloudflare
 *    (siteverify). Protege os fluxos que mandam código pelo canal do app
 *    (generateLink no servidor), onde o Supabase não entra.
 *  - O mesmo token é repassado como `captchaToken` nas chamadas de Auth do
 *    Supabase, para quando a proteção por captcha estiver ligada no
 *    dashboard: aí o próprio GoTrue recusa uma chamada direta à API sem
 *    token — o que fecha o ataque que não usa a tela.
 *
 * Sem as variáveis, tudo passa — nada muda até as chaves existirem.
 */

// A mensagem mora no módulo puro (também usada na recusa por captcha do Supabase).
import { ERRO_HUMANO } from "@/lib/entrada-senha-recusa"
export { ERRO_HUMANO }

/** O token que o widget colocou no formulário (ou undefined). */
export function tokenHumano(fd: FormData): string | undefined {
  const t = String(fd.get("cf-turnstile-response") ?? "").trim()
  return t || undefined
}

/** Sem token: o widget ainda não terminou (ou não foi desenhado). */
export const ERRO_SEM_TOKEN =
  "A verificação de segurança ainda não terminou. Aguarde alguns segundos e clique de novo."

/**
 * Para as chamadas em que o PRÓPRIO Supabase confere o token
 * (signInWithPassword com captcha ligado): só verifica que o token veio.
 * Conferir também na Cloudflare gastava o token antes do Supabase, que às
 * vezes o recusava como duplicado ("timeout-or-duplicate", log de 10/11/2026).
 */
export function exigirTokenPresente(fd: FormData): string | null {
  if (!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) return null
  return tokenHumano(fd) ? null : ERRO_SEM_TOKEN
}

/**
 * Confere o token com a Cloudflare. Devolve a mensagem de erro para a tela,
 * ou null quando está tudo certo (ou quando a proteção está desligada).
 * Só para fluxos em que o Supabase NÃO confere o token depois (ver acima).
 */
export async function exigirHumano(fd: FormData): Promise<string | null> {
  const segredo = process.env.TURNSTILE_SECRET_KEY
  if (!segredo) return null
  const token = tokenHumano(fd)
  if (!token) return ERRO_SEM_TOKEN
  try {
    const h = await headers()
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || undefined
    const corpo = new URLSearchParams({ secret: segredo, response: token })
    if (ip) corpo.set("remoteip", ip)
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: corpo,
    })
    const j = (await r.json()) as { success?: boolean }
    return j.success ? null : ERRO_HUMANO
  } catch {
    // Cloudflare fora do ar não pode trancar o login: o Supabase ainda
    // confere o captchaToken quando a proteção dele está ligada.
    return null
  }
}
