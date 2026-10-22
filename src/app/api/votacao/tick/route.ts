import { rodarAvisosAutomaticos } from "@/lib/db/votacao-aviso-auto"
import { expurgarContatosVencidos } from "@/lib/db/votacao-expurgo"
import { rodarTesteEntrega } from "@/lib/db/votacao-teste-entrega"
import { createServiceClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
// Uma rodada grande (1.600 aptos) leva alguns minutos de e-mails em lotes.
export const maxDuration = 300

/**
 * Tick da votação (fase 2 do plano de 16/10/2026): envio automático dos links
 * pessoais nas rodadas que o ligaram — N horas antes da abertura e, depois,
 * a quem entrar na lista — e a nova tentativa das falhas do provedor
 * (lib/db/votacao-aviso-auto.ts). Também o link a quem cadastrou e-mail
 * pessoal ou Telegram no link geral depois do primeiro envio
 * (lib/db/votacao-aviso-contato.ts, 21/10/2026). E o teste de entrega: o
 * aviso prévio automático e as medições por domínio
 * (lib/db/votacao-teste-entrega.ts, 22/10/2026). Protegido por `CRON_SECRET` (header
 * `x-cron-secret` ou `Authorization: Bearer`). `?tenant=<uuid>` roda só um
 * tenant. O vercel.json chama esta rota a cada 15 minutos; o que não couber
 * numa volta segue na próxima.
 *
 * Na mesma volta, o expurgo dos contatos dos aptos das rodadas apuradas há
 * mais que o prazo da rodada (RIPD da votação, V4; lib/db/votacao-expurgo.ts).
 * Ele vale para todos os tenants, por isso não roda com `?tenant=`.
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
  const client = createServiceClient()
  const resultado = await rodarAvisosAutomaticos({
    client,
    limite: inicio + 240_000,
    tenant,
  })
  if (resultado.erros.length) console.error("[votacao/tick]", resultado.erros.join(" · "))
  const teste = await rodarTesteEntrega({ client, limite: inicio + 240_000, tenant })
  if (teste.erros.length) console.error("[votacao/tick] teste de entrega:", teste.erros.join(" · "))
  const expurgo = tenant ? null : await expurgarContatosVencidos(client)
  if (expurgo?.erro) console.error("[votacao/tick]", expurgo.erro)
  return Response.json({ ...resultado, teste, expurgo })
}

export const GET = handler
export const POST = handler
