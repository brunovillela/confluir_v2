import { processarEntregasPendentes } from "@/lib/db/webhooks"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * Tick dos WEBHOOKS (onda 5, A9): reenvia as entregas pendentes cujo recuo
 * venceu, em todas as entidades (`?tenant=<id>` limita a uma). A cada 15
 * minutos em vercel.json. Protegido por CRON_SECRET.
 */
async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  const enviado = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
  if (!secret || enviado !== secret) return new Response("Não autorizado", { status: 401 })
  const tenant = new URL(req.url).searchParams.get("tenant") ?? undefined
  return Response.json(await processarEntregasPendentes(tenant))
}

export const GET = handler
export const POST = handler
