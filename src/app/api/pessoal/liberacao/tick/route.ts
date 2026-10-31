import { contextoDoTenant } from "@/lib/db/comunicacao-mensagens"
import { liberarRemessasDoDia } from "@/lib/db/pessoal-liberacao-automatica"
import { tenantsDoResumo } from "@/lib/db/vencimentos"
import { createServiceClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * Tick diário da LIBERAÇÃO AUTOMÁTICA de contracheques e ponto (31/10/2026).
 * Protegido por `CRON_SECRET`. A remessa com a data de liberação chegada tem
 * os itens bloqueados liberados e cada funcionário avisado
 * (lib/db/pessoal-liberacao-automatica.ts).
 *
 * `?tenant=<uuid>` roda um tenant só (disparo manual e testes na demo).
 */
async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  const enviado =
    req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
  if (!secret || enviado !== secret) return new Response("Não autorizado", { status: 401 })

  const unico = new URL(req.url).searchParams.get("tenant")
  const tenants = (await tenantsDoResumo()).filter((t) => !unico || t === unico)
  const svc = createServiceClient()
  const resultados: { tenant: string; remessas: number; liberados: number; erros: string[] }[] = []
  for (const t of tenants) {
    try {
      resultados.push({ tenant: t, ...(await liberarRemessasDoDia(t, svc, await contextoDoTenant(t, svc))) })
    } catch (e) {
      resultados.push({ tenant: t, remessas: 0, liberados: 0, erros: [e instanceof Error ? e.message : String(e)] })
    }
  }
  for (const r of resultados) {
    if (r.erros.length) console.error(`[pessoal/liberacao/tick] ${r.tenant}:`, r.erros.join(" · "))
  }
  return Response.json({ verificados: tenants.length, processados: resultados })
}

export const GET = handler
export const POST = handler
