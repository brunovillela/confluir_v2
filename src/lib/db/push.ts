import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import webPush from "web-push"

import { esquemaAusente } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * WEB PUSH (onda 4, D2): o aviso do sino também chega como notificação do
 * celular, para quem ligou "Receber no celular" em Meu perfil → Avisos.
 * Chaves VAPID por env; sem elas, tudo aqui é inerte. Assinaturas em
 * `push_assinaturas` (supabase/push-assinaturas.sql); uma assinatura que o
 * navegador cancelou (404/410) é apagada no primeiro envio que falha.
 */

export function pushConfigurado(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

let vapidPronto = false
function prepararVapid(): boolean {
  if (!pushConfigurado()) return false
  if (!vapidPronto) {
    webPush.setVapidDetails(
      process.env.VAPID_SUBJECT ?? "mailto:contato@confluir.online",
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string
    )
    vapidPronto = true
  }
  return true
}

export type AssinaturaPush = { endpoint: string; keys: { p256dh: string; auth: string } }

export async function registrarAssinaturaPush(
  usuarioId: string,
  assinatura: AssinaturaPush,
  userAgent: string | null
): Promise<{ erro?: string }> {
  if (!assinatura?.endpoint || !assinatura.keys?.p256dh || !assinatura.keys?.auth) return { erro: "Assinatura inválida." }
  const admin = await createAdminClient()
  const { error } = await admin.from("push_assinaturas").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      usuario_id: usuarioId,
      endpoint: assinatura.endpoint,
      p256dh: assinatura.keys.p256dh,
      auth: assinatura.keys.auth,
      user_agent: userAgent?.slice(0, 300) ?? null,
    },
    { onConflict: "endpoint" }
  )
  if (error) {
    if (esquemaAusente(error)) return { erro: "Falta rodar o SQL supabase/push-assinaturas.sql." }
    return { erro: error.message }
  }
  return {}
}

export async function removerAssinaturaPush(usuarioId: string, endpoint: string): Promise<void> {
  const admin = await createAdminClient()
  await admin.from("push_assinaturas").delete().eq("usuario_id", usuarioId).eq("endpoint", endpoint)
}

export async function contarAssinaturasPush(usuarioId: string): Promise<number> {
  const admin = await createAdminClient()
  const { count, error } = await admin
    .from("push_assinaturas")
    .select("id", { count: "exact", head: true })
    .eq("usuario_id", usuarioId)
  return error ? 0 : (count ?? 0)
}

/** Envia a todos os aparelhos da pessoa. Melhor esforço: nunca lança. */
export async function enviarPushWeb(
  usuarioId: string,
  aviso: { titulo: string; corpo: string; url?: string | null; tag?: string },
  client?: SupabaseClient
): Promise<void> {
  try {
    if (!prepararVapid()) return
    const admin = client ?? (await createAdminClient())
    const { data, error } = await admin
      .from("push_assinaturas")
      .select("id, endpoint, p256dh, auth")
      .eq("usuario_id", usuarioId)
    if (error || !data?.length) return
    const carga = JSON.stringify({ titulo: aviso.titulo, corpo: aviso.corpo, url: aviso.url ?? "/painel", tag: aviso.tag })
    await Promise.all(
      data.map(async (s) => {
        try {
          await webPush.sendNotification(
            { endpoint: String(s.endpoint), keys: { p256dh: String(s.p256dh), auth: String(s.auth) } },
            carga,
            { TTL: 60 * 60 * 12, urgency: "normal" }
          )
          await admin.from("push_assinaturas").update({ usado_em: new Date().toISOString() }).eq("id", s.id)
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) await admin.from("push_assinaturas").delete().eq("id", s.id)
          else console.error("push:", (e as Error).message)
        }
      })
    )
  } catch (e) {
    console.error("push:", e)
  }
}
