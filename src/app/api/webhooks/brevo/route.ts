import { timingSafeEqual } from "node:crypto"

import { registrarEventoBrevo, type EventoBrevo } from "@/lib/db/votacao-eventos-email"
import { createServiceClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

/**
 * Webhook de e-mails transacionais da Brevo (fase 4 do plano de 21/10/2026):
 * entrega, clique e rejeição dos e-mails de votação — ver
 * lib/db/votacao-eventos-email.ts. Configurado no painel da Brevo
 * (Transactional › Settings › Webhook) apontando para
 * https://confluir.online/api/webhooks/brevo, com os eventos Delivered,
 * Clicked, Hard bounce, Invalid email, Blocked e Spam, e autenticação "Token"
 * = `BREVO_WEBHOOK_SECRET` (vem no `Authorization: Bearer`; `?token=` também
 * vale). Um webhook só para todas as entidades: a entidade vem no
 * X-Mailin-custom de cada e-mail. Responde 200 a todo evento válido para a
 * Brevo não reenviar.
 */
function autorizado(req: Request): boolean {
  const segredo = process.env.BREVO_WEBHOOK_SECRET
  if (!segredo) return false
  const veio =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? new URL(req.url).searchParams.get("token") ?? ""
  const a = Buffer.from(veio)
  const b = Buffer.from(segredo)
  return a.length === b.length && timingSafeEqual(a, b)
}

export async function POST(req: Request): Promise<Response> {
  if (!autorizado(req)) return new Response("Não autorizado", { status: 401 })
  let corpo: unknown
  try {
    corpo = await req.json()
  } catch {
    return new Response("JSON inválido", { status: 400 })
  }
  const eventos = (Array.isArray(corpo) ? corpo : [corpo]).filter(
    (e): e is EventoBrevo => typeof e === "object" && e !== null
  )
  const client = createServiceClient()
  const feitos = await Promise.all(eventos.map((e) => registrarEventoBrevo(client, e)))
  const erros = feitos.filter((f) => f.startsWith("erro"))
  if (erros.length) console.error("[webhooks/brevo]", erros.join(" · "))
  return Response.json({ recebidos: eventos.length, feitos })
}
