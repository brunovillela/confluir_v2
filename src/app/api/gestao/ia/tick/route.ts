import { testarContasEmailDasEntidades } from "@/lib/db/email-teste-diario"
import { testarChavesDasEntidades } from "@/lib/db/ia-teste-diario"
import { createServiceClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * Tick diário da Gestão › IA: testa a chave de IA de cada entidade que tem
 * uma e avisa a Gestão quando ela não responde (lib/db/ia-teste-diario.ts).
 * Protegido por `CRON_SECRET` (header `x-cron-secret` ou `Authorization:
 * Bearer`), como os outros ticks. `?tenant=<uuid>` testa uma entidade só.
 *
 * Desde 27/11/2026 testa também a conta própria de e-mail de cada entidade
 * (Gestão › E-mail, lib/db/email-teste-diario.ts), no mesmo agendamento.
 */
async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  const enviado =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    ""
  if (!secret || enviado !== secret) {
    return new Response("Não autorizado", { status: 401 })
  }
  const unico = new URL(req.url).searchParams.get("tenant")
  try {
    const svc = createServiceClient()
    const [resultados, email] = await Promise.all([testarChavesDasEntidades(svc, unico), testarContasEmailDasEntidades(svc, unico)])
    return Response.json({ ok: true, resultados, email })
  } catch (e) {
    return Response.json({ ok: false, erro: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

export const GET = handler
export const POST = handler
