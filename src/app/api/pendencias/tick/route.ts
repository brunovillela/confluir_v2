import { lembrarPendencias, tenantsDoLembrete } from "@/lib/db/pendencias-lembrete"

export const runtime = "nodejs"
export const maxDuration = 120

/**
 * Tick diário do LEMBRETE DE PENDÊNCIAS (onda 2, U2). Protegido por
 * `CRON_SECRET` (header `x-cron-secret` ou `Authorization: Bearer`), como os
 * outros ticks.
 *
 * Para cada tenant, cada pessoa com algo esperando por ela recebe um resumo
 * (sino, e-mail e Telegram conforme preferência), uma vez por dia, com o que
 * está parado há mais de 7 dias em destaque (lib/db/pendencias-lembrete.ts).
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
  const tenants = (await tenantsDoLembrete()).filter((t) => !unico || t.id === unico)
  const resultados: { tenant: string; pessoas: number; lembretes: number; erro?: string }[] = []
  for (const t of tenants) {
    try {
      resultados.push({ tenant: t.id, ...(await lembrarPendencias(t.id)) })
    } catch (e) {
      resultados.push({ tenant: t.id, pessoas: 0, lembretes: 0, erro: e instanceof Error ? e.message : String(e) })
    }
  }
  return Response.json({ verificados: tenants.length, processados: resultados })
}

export const GET = handler
export const POST = handler
