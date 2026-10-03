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

export const ERRO_HUMANO =
  "Não foi possível confirmar que você não é um robô. Recarregue a página e tente de novo."

/** O token que o widget colocou no formulário (ou undefined). */
export function tokenHumano(fd: FormData): string | undefined {
  const t = String(fd.get("cf-turnstile-response") ?? "").trim()
  return t || undefined
}

/**
 * Confere o token com a Cloudflare. Devolve a mensagem de erro para a tela,
 * ou null quando está tudo certo (ou quando a proteção está desligada).
 */
export async function exigirHumano(fd: FormData): Promise<string | null> {
  const segredo = process.env.TURNSTILE_SECRET_KEY
  if (!segredo) return null
  const token = tokenHumano(fd)
  if (!token) return ERRO_HUMANO
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
