import { contextoDoTenant } from "@/lib/db/comunicacao-mensagens"
import { lembrarRemessasEmPreparacao } from "@/lib/db/diarias-remessas"
import { tenantsDoResumo } from "@/lib/db/vencimentos"
import { createServiceClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const maxDuration = 120

/**
 * Tick diário do LEMBRETE DE REMESSA DE DIÁRIAS EM PREPARAÇÃO (10/10/2026).
 * Protegido por `CRON_SECRET`. Remessa cuja primeira diária tem 7 dias ou
 * mais e ainda não foi enviada para avaliação lembra o beneficiário e quem
 * lançou — um lembrete por semana (lib/db/diarias-remessas.ts).
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
  const resultados: { tenant: string; remessas: number; avisos: number; erro?: string }[] = []
  for (const t of tenants) {
    try {
      resultados.push({ tenant: t, ...(await lembrarRemessasEmPreparacao(t, svc, await contextoDoTenant(t, svc))) })
    } catch (e) {
      resultados.push({ tenant: t, remessas: 0, avisos: 0, erro: e instanceof Error ? e.message : String(e) })
    }
  }
  return Response.json({ verificados: tenants.length, processados: resultados })
}

export const GET = handler
export const POST = handler
