import * as Sentry from "@sentry/nextjs"

import { limparEvento } from "@/lib/sentry-filtro"

/**
 * Sentry no servidor (Node). Sem SENTRY_DSN o SDK fica desligado — nada sai
 * da máquina. Em produção, cada erro vira um evento com a rota e o digest,
 * sem cookies, corpo de requisição ou tokens (ver lib/sentry-filtro.ts).
 */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 0.1,
  beforeSend: limparEvento,
})
