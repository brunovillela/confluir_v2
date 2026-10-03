import * as Sentry from "@sentry/nextjs"

import { limparEvento } from "@/lib/sentry-filtro"

/**
 * Sentry no navegador. Sem NEXT_PUBLIC_SENTRY_DSN fica desligado. Captura
 * erros de renderização e de interação que o servidor não vê; sem replay,
 * sem PII, e com as mesmas regras de limpeza do servidor.
 */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV,
  tracesSampleRate: 0.05,
  beforeSend: limparEvento,
})
