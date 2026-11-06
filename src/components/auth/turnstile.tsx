"use client"

import Script from "next/script"

/**
 * Cloudflare Turnstile — o "sou humano" invisível (item 0+a do plano da
 * onda 0). Só aparece quando NEXT_PUBLIC_TURNSTILE_SITE_KEY está definida;
 * sem ela, não renderiza nada e as actions deixam passar.
 *
 * O script do Turnstile injeta no <form> um input oculto chamado
 * `cf-turnstile-response` com o token; a action lê esse campo
 * (lib/turnstile.ts) e o confere com a Cloudflare e/ou repassa ao Supabase.
 * Dentro de um <form> que faz submit por server action, o token é consumido
 * uma vez só. O modo "auto" só renova o token VENCIDO, não o gasto: o
 * formulário chama renovarTurnstile depois de cada envio.
 */
export function Turnstile({ acao }: { acao?: string }) {
  const chave = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  if (!chave) return null
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
      <div
        className="cf-turnstile"
        data-sitekey={chave}
        data-action={acao}
        data-size="flexible"
        data-language="pt-br"
        data-retry="auto"
        data-refresh-expired="auto"
      />
    </>
  )
}

type ApiTurnstile = { reset: (widget?: string | HTMLElement) => void }

/**
 * Pede um token novo ao Turnstile do formulário depois de cada envio. O token
 * vale uma conferência só (lib/turnstile.ts): sem renovar, o segundo envio do
 * mesmo formulário — senha digitada errado, "Reenviar código" — esbarrava em
 * "não foi possível confirmar que você não é um robô" (ou, no Supabase, numa
 * recusa por captcha). Sem o widget (chaves ausentes), não faz nada.
 */
export function renovarTurnstile(form: HTMLFormElement | null): void {
  const widget = form?.querySelector<HTMLElement>(".cf-turnstile")
  const turnstile = (window as typeof window & { turnstile?: ApiTurnstile }).turnstile
  if (!widget || !turnstile) return
  try {
    turnstile.reset(widget)
  } catch {
    // Widget ainda não desenhado: o token atual segue valendo.
  }
}
