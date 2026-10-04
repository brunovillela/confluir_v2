import { enviarResumoVencimentos, tenantsDoResumo } from "@/lib/db/vencimentos"

export const runtime = "nodejs"
export const maxDuration = 120

/**
 * Tick diário do RESUMO DE VENCIMENTOS (onda 2, A6/D4). Protegido por
 * `CRON_SECRET` (header `x-cron-secret` ou `Authorization: Bearer`).
 *
 * Para cada tenant, cada pessoa recebe (sino, e-mail e Telegram conforme
 * preferência) o que está vencendo ou vencido nas áreas em que tem permissão:
 * contratos, ajudas, acordos, CNH, seguro, locação, ASO, férias, treinamentos,
 * faturas de viagem, ordens, mandatos, assentos, convênios e CIPA
 * (lib/db/vencimentos.ts). Uma vez por dia; sem vencimento, nada sai.
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
  const tenants = (await tenantsDoResumo()).filter((t) => !unico || t === unico)
  const resultados: { tenant: string; grupos: number; pessoas: number; resumos: number; erro?: string }[] = []
  for (const t of tenants) {
    try {
      resultados.push({ tenant: t, ...(await enviarResumoVencimentos(t)) })
    } catch (e) {
      resultados.push({ tenant: t, grupos: 0, pessoas: 0, resumos: 0, erro: e instanceof Error ? e.message : String(e) })
    }
  }
  return Response.json({ verificados: tenants.length, processados: resultados })
}

export const GET = handler
export const POST = handler
