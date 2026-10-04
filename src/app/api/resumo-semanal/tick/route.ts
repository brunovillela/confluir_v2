import { tenantsDoLembrete } from "@/lib/db/pendencias-lembrete"
import { enviarResumoSemanal } from "@/lib/db/resumo-semanal"

export const runtime = "nodejs"
export const maxDuration = 300

/**
 * Tick semanal do RESUMO DE GESTÃO (onda 3, I10). Protegido por
 * `CRON_SECRET`; agendado em vercel.json toda segunda às 11:00 UTC (08:00
 * BRT). `?tenant=<uuid>` roda um tenant só (disparo manual e testes).
 */
async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET
  const enviado = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
  if (!secret || enviado !== secret) return new Response("Não autorizado", { status: 401 })

  const unico = new URL(req.url).searchParams.get("tenant")
  const tenants = (await tenantsDoLembrete()).filter((t) => !unico || t.id === unico)
  const resultados: { tenant: string; pessoas: number; resumos: number; erro?: string }[] = []
  for (const t of tenants) {
    try {
      resultados.push({ tenant: t.id, ...(await enviarResumoSemanal(t.id)) })
    } catch (e) {
      resultados.push({ tenant: t.id, pessoas: 0, resumos: 0, erro: e instanceof Error ? e.message : String(e) })
    }
  }
  return Response.json({ verificados: tenants.length, processados: resultados })
}

export const GET = handler
export const POST = handler
