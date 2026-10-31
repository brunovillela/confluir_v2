import { registrarComandosTelegram } from "@/lib/telegram"
import { comandosParaOTelegram } from "@/lib/telegram-pendencias-fluxo"

export const runtime = "nodejs"

/**
 * Registra o MENU DE COMANDOS do bot (o botão "/" do Telegram) com
 * setMyCommands, a partir da mesma lista da /ajuda (COMANDOS_BOT em
 * lib/telegram-pendencias-fluxo.ts). Idempotente: o cron diário do
 * vercel.json roda depois de cada deploy, e um comando novo aparece no menu
 * no dia seguinte, no mais tardar. Para já:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://<dominio>/api/telegram/comandos
 *
 * Protegido por `CRON_SECRET` (header `x-cron-secret` ou `Authorization:
 * Bearer`), como os ticks. O bot é um só para todas as entidades.
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
  const comandos = comandosParaOTelegram()
  const r = await registrarComandosTelegram(comandos)
  return Response.json({ ...r, comandos: comandos.length }, { status: r.ok ? 200 : 502 })
}

export const GET = handler
export const POST = handler
