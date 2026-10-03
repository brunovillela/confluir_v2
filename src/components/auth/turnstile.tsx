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
 * uma vez só — por isso o widget fica em modo "auto" e se renova sozinho.
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
