import * as Sentry from "@sentry/nextjs"

/**
 * Observabilidade do servidor (achado E1 da avaliação de 03/10). Antes, um
 * erro em produção aparecia só na tela padrão do Next, em inglês, e ninguém
 * ficava sabendo. Agora cada erro de requisição vai ao Sentry (quando
 * SENTRY_DSN está definido) com rota, método e digest — e sem dados pessoais
 * (lib/sentry-filtro.ts).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("../sentry.server.config")
  if (process.env.NEXT_RUNTIME === "edge") await import("../sentry.edge.config")
}

export const onRequestError = Sentry.captureRequestError
