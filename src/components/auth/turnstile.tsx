"use client"

import { useEffect, useRef } from "react"

/**
 * Cloudflare Turnstile — o "sou humano" invisível (item 0+a do plano da
 * onda 0). Só aparece quando NEXT_PUBLIC_TURNSTILE_SITE_KEY está definida;
 * sem ela, não renderiza nada e as actions deixam passar.
 *
 * O widget injeta no <form> um input oculto `cf-turnstile-response` com o
 * token; a action lê esse campo (lib/turnstile.ts) e o confere com a
 * Cloudflare ou o repassa ao Supabase. O token vale UMA conferência: o
 * formulário chama renovarTurnstile depois de cada envio.
 *
 * Desenho EXPLÍCITO (10/11/2026): antes o script fazia o desenho implícito,
 * que só procura os widgets no carregamento da página. Quem ia de "Entrar"
 * para "Esqueci minha senha" por link interno (navegação sem recarregar)
 * ficava sem widget, sem token — e recebia "não foi possível confirmar que
 * você não é um robô" (vídeo do Vitor, Sindipetro-NF). Agora cada componente
 * desenha o seu widget ao montar e o remove ao sair.
 */

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

type OpcoesWidget = {
  sitekey: string
  action?: string
  size?: "normal" | "flexible" | "compact"
  language?: string
  retry?: "auto" | "never"
  "refresh-expired"?: "auto" | "manual" | "never"
  "response-field-name"?: string
}
type ApiTurnstile = {
  render: (container: HTMLElement, opcoes: OpcoesWidget) => string | undefined
  reset: (widget?: string | HTMLElement) => void
  remove: (widget: string) => void
}
const api = () => (window as typeof window & { turnstile?: ApiTurnstile }).turnstile

let carregando: Promise<ApiTurnstile> | null = null

/** Carrega o script da Cloudflare uma vez por página (vale para todas as navegações). */
function carregarApi(): Promise<ApiTurnstile> {
  const pronto = api()
  if (pronto) return Promise.resolve(pronto)
  if (carregando) return carregando
  carregando = new Promise<ApiTurnstile>((ok, falha) => {
    const tag = document.createElement("script")
    tag.src = SCRIPT
    tag.async = true
    tag.onload = () => {
      const t = api()
      if (t) ok(t)
      else falha(new Error("Turnstile sem API"))
    }
    tag.onerror = () => {
      carregando = null // deixa tentar de novo na próxima montagem
      falha(new Error("Turnstile não carregou"))
    }
    document.head.appendChild(tag)
  })
  return carregando
}

export function Turnstile({ acao }: { acao?: string }) {
  const chave = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chave) return
    let widgetId: string | undefined
    let ativo = true
    carregarApi()
      .then((t) => {
        const el = ref.current
        if (!ativo || !el) return
        widgetId = t.render(el, {
          sitekey: chave,
          action: acao,
          size: "flexible",
          language: "pt-br",
          retry: "auto",
          "refresh-expired": "auto",
          "response-field-name": "cf-turnstile-response",
        })
        if (widgetId) el.dataset.widgetId = widgetId
      })
      .catch(() => {
        // Sem o script (rede bloqueando a Cloudflare): a action responde com a
        // mensagem de verificação; nada a fazer aqui.
      })
    return () => {
      ativo = false
      if (widgetId) {
        try {
          api()?.remove(widgetId)
        } catch {
          // já removido
        }
      }
    }
  }, [chave, acao])

  if (!chave) return null
  return <div ref={ref} className="cf-turnstile" />
}

/**
 * Pede um token novo ao Turnstile do formulário depois de cada envio. O token
 * vale uma conferência só (lib/turnstile.ts): sem renovar, o segundo envio do
 * mesmo formulário — senha digitada errado, "Reenviar código" — esbarrava em
 * "não foi possível confirmar que você não é um robô" (ou, no Supabase, numa
 * recusa por captcha). Sem o widget (chaves ausentes), não faz nada.
 */
export function renovarTurnstile(form: HTMLFormElement | null): void {
  const widget = form?.querySelector<HTMLElement>(".cf-turnstile")
  const turnstile = api()
  if (!widget || !turnstile) return
  try {
    turnstile.reset(widget.dataset.widgetId ?? widget)
  } catch {
    // Widget ainda não desenhado: o token atual segue valendo.
  }
}
