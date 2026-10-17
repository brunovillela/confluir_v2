import { rodarAvisosAutomaticos } from "@/lib/db/votacao-aviso-auto"
import { createServiceClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
// Uma rodada grande (1.600 aptos) leva alguns minutos de e-mails em lotes.
export const maxDuration = 300

/**
 * Tick da votação (fase 2 do plano de 16/10/2026): envio automático dos links
 * pessoais nas rodadas que o ligaram — N horas antes da abertura e, depois,
 * a quem entrar na lista — e a nova tentativa das falhas do provedor
 * (lib/db/votacao-aviso-auto.ts). Protegido por `CRON_SECRET` (header
 * `x-cron-secret` ou `Authorization: Bearer`). `?tenant=<uuid>` roda só um
 * tenant. O vercel.json chama esta rota a cada 15 minutos; o que não couber
 * numa volta segue na próxima.
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
  const inicio = Date.now()
  const tenant = new URL(req.url).searchParams.get("tenant")
  // Folga de 60 s antes do maxDuration para gravar as marcas do último lote.
  const resultado = await rodarAvisosAutomaticos({
    client: createServiceClient(),
    limite: inicio + 240_000,
    tenant,
  })
  if (resultado.erros.length) console.error("[votacao/tick]", resultado.erros.join(" · "))
  return Response.json(resultado)
}

export const GET = handler
export const POST = handler
