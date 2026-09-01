import { maturarFiliacoesColetivas, tenantsComColetivaAberta } from "@/lib/db/filiacao-coletiva"

export const runtime = "nodejs"

/**
 * Tick da MATURAÇÃO da filiação coletiva. Protegido por `CRON_SECRET` (header
 * `x-cron-secret` ou `Authorization: Bearer`), igual ao tick da Comunicação.
 *
 * Percorre os tenants com processo aplicado e avança quem venceu o prazo:
 * "Em processo de filiação coletiva" → "Filiação aguarda fonte" (informada à
 * fonte) → "Ativo". O botão "Processar prazos agora" na área faz o mesmo para
 * o tenant da sessão, sem esperar o cron.
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

  const tenants = await tenantsComColetivaAberta()
  const resultados: {
    tenant: string
    avancados: number
    ativados: number
  }[] = []
  for (const tenantId of tenants) {
    const r = await maturarFiliacoesColetivas(tenantId)
    if (r.avancados > 0 || r.ativados > 0) {
      resultados.push({ tenant: tenantId, ...r })
    }
  }
  return Response.json({ verificados: tenants.length, processados: resultados })
}

export const GET = handler
export const POST = handler
