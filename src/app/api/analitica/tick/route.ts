import { atualizarAnalitica } from "@/lib/db/analitica"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * Tick noturno da CAMADA ANALÍTICA (onda 3, I1): recalcula as views
 * materializadas de filiação, arrecadação, despesa e frota (todas as
 * entidades). Protegido por `CRON_SECRET` (header `x-cron-secret` ou
 * `Authorization: Bearer`). Agendado em vercel.json às 06:00 UTC (03:00 BRT).
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
  const r = await atualizarAnalitica()
  return Response.json(r, { status: r.ok ? 200 : 503 })
}

export const GET = handler
export const POST = handler
