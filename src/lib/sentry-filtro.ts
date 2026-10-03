import type { ErrorEvent } from "@sentry/nextjs"

/**
 * Filtro dos eventos enviados ao Sentry — vale no servidor, no edge e no
 * navegador (sem imports de servidor aqui).
 *
 * O Sentry recebe só o necessário para achar o erro: nunca cookies, nunca
 * Authorization, nunca o corpo da requisição (onde vão senha, CPF, código),
 * e nunca os tokens que viajam na URL (/assinar/<token>, ?t=, token_hash=).
 * CPFs que apareçam em mensagens de erro saem mascarados.
 */
export function limparEvento(evento: ErrorEvent): ErrorEvent | null {
  if (evento.request) {
    delete evento.request.cookies
    delete evento.request.data
    if (evento.request.headers) {
      for (const chave of Object.keys(evento.request.headers)) {
        if (/^(cookie|authorization|x-cron-secret|x-telegram-bot-api-secret-token)$/i.test(chave)) {
          delete evento.request.headers[chave]
        }
      }
    }
    if (evento.request.url) evento.request.url = limparUrl(evento.request.url)
    if (evento.request.query_string) evento.request.query_string = "[removido]"
  }
  for (const ex of evento.exception?.values ?? []) {
    if (ex.value) ex.value = mascararCpf(ex.value)
  }
  if (evento.message) evento.message = mascararCpf(evento.message)
  for (const crumb of evento.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = mascararCpf(crumb.message)
    if (crumb.data?.url && typeof crumb.data.url === "string") crumb.data.url = limparUrl(crumb.data.url)
  }
  return evento
}

/** Troca por "[token]" os segmentos e parâmetros que carregam acesso. */
export function limparUrl(url: string): string {
  return url
    .replace(/([?&](t|token_hash|code|token|s)=)[^&#]+/g, "$1[token]")
    .replace(/\/(assinar|ficha|inscricao|meus-dados|reserva|oferta|avaliar|sair|comprovante|verificar)\/[^/?#]+/g, "/$1/[token]")
}

export function mascararCpf(texto: string): string {
  return texto.replace(/\b(\d{3})\.?\d{3}\.?\d{3}-?(\d{2})\b/g, "$1.***.***-$2")
}
