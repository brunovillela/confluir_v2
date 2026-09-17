import { avisarPreventivas, tenantsComPreventivas } from "@/lib/db/veiculos-avisos"

export const runtime = "nodejs"

/**
 * Tick diário do aviso de preventivas da frota. Protegido por `CRON_SECRET`
 * (header `x-cron-secret` ou `Authorization: Bearer`), igual aos outros ticks.
 *
 * Percorre os tenants com preventiva programada e avisa a gestão da frota (sino
 * e Telegram) das revisões que entraram na janela de alerta ou venceram — cada
 * aviso uma vez só por pessoa (ver lib/db/veiculos-avisos.ts).
 *
 * `?tenant=<uuid>` roda um tenant só (disparo manual e testes na demo).
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
  const tenants = (await tenantsComPreventivas()).filter((t) => !unico || t === unico)
  const resultados: { tenant: string; alertas: number; enviados: number; erro?: string }[] = []
  for (const tenantId of tenants) {
    try {
      const r = await avisarPreventivas(tenantId)
      if (r.alertas > 0) resultados.push({ tenant: tenantId, ...r })
    } catch (e) {
      resultados.push({ tenant: tenantId, alertas: 0, enviados: 0, erro: e instanceof Error ? e.message : String(e) })
    }
  }
  return Response.json({ verificados: tenants.length, processados: resultados })
}

export const GET = handler
export const POST = handler
