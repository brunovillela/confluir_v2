import { convidarParaAvaliar, tenantsComHotel } from "@/lib/db/hospedagem-avaliacoes"

export const runtime = "nodejs"

/**
 * Tick diário da avaliação da hospedagem. Protegido por `CRON_SECRET`
 * (header `x-cron-secret` ou `Authorization: Bearer`), igual aos outros ticks.
 *
 * Para cada entidade com hotel: abre as pendências das estadias concluídas
 * (check-out até ontem), manda o CONVITE com as 5 estrelas e, depois de
 * alguns dias sem resposta, um LEMBRETE — uma vez cada (ver
 * lib/db/hospedagem-avaliacoes.ts).
 *
 * `?tenant=<uuid>` roda uma entidade só (disparo manual e testes na demo).
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
  const tenants = (await tenantsComHotel()).filter((t) => !unico || t === unico)
  const resultados: { tenant: string; criadas: number; convites: number; lembretes: number; erro?: string }[] = []
  for (const tenantId of tenants) {
    try {
      const r = await convidarParaAvaliar(tenantId)
      if (r.criadas || r.convites || r.lembretes || r.erro) resultados.push({ tenant: tenantId, ...r })
    } catch (e) {
      resultados.push({ tenant: tenantId, criadas: 0, convites: 0, lembretes: 0, erro: e instanceof Error ? e.message : String(e) })
    }
  }
  return Response.json({ verificados: tenants.length, processados: resultados })
}

export const GET = handler
export const POST = handler
