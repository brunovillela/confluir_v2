export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
export const EMP_PROPRIETARIA_ID = process.env.NEXT_PUBLIC_EMP_PROPRIETARIA_ID!
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"

/**
 * Domínio base da plataforma (sem protocolo) — os tenants são servidos em
 * `<slug>.<APP_DOMAIN>`. Em dev, `<slug>.localhost:3000` funciona porque o
 * navegador resolve *.localhost para loopback.
 */
export const APP_DOMAIN =
  process.env.NEXT_PUBLIC_APP_DOMAIN ?? "localhost:3000"
