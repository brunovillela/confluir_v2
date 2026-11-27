import { timingSafeEqual } from "node:crypto"

import { entidadeDoTokenWebhook } from "@/lib/db/email-conta"
import { registrarEventoEnvio } from "@/lib/db/email-envios"
import { registrarEventoBrevo, type EventoBrevo } from "@/lib/db/votacao-eventos-email"
import { createServiceClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"

/**
 * Webhook de e-mails transacionais da Brevo (fase 4 do plano de 21/10/2026):
 * entrega, clique e rejeição dos e-mails de votação — ver
 * lib/db/votacao-eventos-email.ts. Desde 23/11/2026 também a entrega, o
 * adiamento e a rejeição de TODO e-mail no registro geral (email_envios,
 * Gestão › E-mail), pela marca `e:<id>` no fim do X-Mailin-custom. Configurado no painel da Brevo
 * (Transactional › Settings › Webhook) apontando para
 * https://confluir.online/api/webhooks/brevo, com os eventos Delivered,
 * Clicked, Hard bounce, Invalid email, Blocked e Spam, e autenticação "Token"
 * = `BREVO_WEBHOOK_SECRET` (vem no `Authorization: Bearer`; `?token=` também
 * vale). Um webhook só para todas as entidades: a entidade vem no
 * X-Mailin-custom de cada e-mail. Responde 200 a todo evento válido para a
 * Brevo não reenviar.
 *
 * Conta própria da entidade (Gestão › E-mail, 27/11/2026): o webhook da conta
 * Brevo da entidade aponta para a mesma rota com o token que a Gestão gerou
 * (whk_…, guardado só como hash). Com ele, os eventos só valem para os
 * e-mails daquela entidade.
 */
async function autorizado(req: Request): Promise<{ ok: false } | { ok: true; entidade: string | null }> {
  const veio =
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? new URL(req.url).searchParams.get("token") ?? ""
  const segredo = process.env.BREVO_WEBHOOK_SECRET
  if (segredo) {
    const a = Buffer.from(veio)
    const b = Buffer.from(segredo)
    if (a.length === b.length && timingSafeEqual(a, b)) return { ok: true, entidade: null }
  }
  const entidade = veio ? await entidadeDoTokenWebhook(veio) : null
  return entidade ? { ok: true, entidade } : { ok: false }
}

export async function POST(req: Request): Promise<Response> {
  const acesso = await autorizado(req)
  if (!acesso.ok) return new Response("Não autorizado", { status: 401 })
  const somente = acesso.entidade
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
  // Cada evento vai ao registro geral do envio (Gestão › E-mail) e, se for de votação, ao apto.
  const feitos = await Promise.all(
    eventos.map(async (e) => {
      // Token de entidade: a votação só lê o evento se a marca for da mesma entidade.
      const marca = String(e["X-Mailin-custom"] ?? e["x-mailin-custom"] ?? "")
      const votoDeOutra = somente !== null && marca.startsWith("voto|") && !marca.startsWith(`voto|${somente}|`)
      const [envio, voto] = await Promise.all([
        registrarEventoEnvio(client, e, somente),
        votoDeOutra ? Promise.resolve("ignorado (outra entidade)") : registrarEventoBrevo(client, e),
      ])
      return `${envio} · ${voto}`
    })
  )
  const erros = feitos.filter((f) => f.includes("erro"))
  if (erros.length) console.error("[webhooks/brevo]", erros.join(" · "))
  return Response.json({ recebidos: eventos.length, feitos })
}
