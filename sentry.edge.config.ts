import * as Sentry from "@sentry/nextjs"

import { limparEvento } from "@/lib/sentry-filtro"

/** Sentry no runtime edge (proxy). Mesmas regras do servidor. */
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  release: process.env.VERCEL_GIT_COMMIT_SHA,
  tracesSampleRate: 0.1,
  beforeSend: limparEvento,
})
