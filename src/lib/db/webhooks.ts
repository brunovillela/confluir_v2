import "server-only"

import { createHmac, randomBytes } from "node:crypto"

import type { SupabaseClient } from "@supabase/supabase-js"

import { type EventoWebhook, eventoWebhookValido } from "@/lib/api-publica-catalogo"
import { depoisDaResposta } from "@/lib/db/avisos"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { createAdminClient, createServiceClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * WEBHOOKS DE SAÍDA (onda 5, A9). `emitirEvento` grava uma entrega por
 * webhook ativo inscrito no evento e tenta entregar logo depois da resposta;
 * o que falhar fica na fila com recuo (1 min, 10 min, 1 h, 6 h) e o cron
 * `/api/webhooks/tick` reenvia; na 5ª falha a entrega vira "falhou" e o
 * webhook acumula `falhas_seguidas` (a tela mostra). Cada POST leva
 * `X-Confluir-Evento`, `X-Confluir-Entrega` e `X-Confluir-Assinatura:
 * sha256=<HMAC do corpo com o segredo>`. Tudo melhor esforço: emitir um
 * evento nunca derruba a ação que o gerou.
 */

const RECUO_MINUTOS = [1, 10, 60, 360]
const MAX_TENTATIVAS = 5
const TIMEOUT_MS = 10_000

export type Webhook = {
  id: string
  url: string
  segredo: string
  eventos: string[]
  descricao: string | null
  ativo: boolean
  falhasSeguidas: number
  ultimoSucessoEm: string | null
  ultimoErro: string | null
  criadoEm: string
}

export type Entrega = {
  id: string
  webhookId: string
  evento: string
  situacao: "pendente" | "entregue" | "falhou"
  tentativas: number
  proximaTentativaEm: string
  ultimoStatus: number | null
  ultimoErro: string | null
  entregueEm: string | null
  criadoEm: string
  payload: unknown
}

type Ambiente = { client?: SupabaseClient; tenantId?: string }

function montarWebhook(w: Record<string, unknown>): Webhook {
  return {
    id: String(w.id),
    url: String(w.url),
    segredo: String(w.segredo),
    eventos: (w.eventos as string[]) ?? [],
    descricao: texto(w.descricao),
    ativo: w.ativo !== false,
    falhasSeguidas: Number(w.falhas_seguidas ?? 0),
    ultimoSucessoEm: texto(w.ultimo_sucesso_em),
    ultimoErro: texto(w.ultimo_erro),
    criadoEm: String(w.created_at),
  }
}

function montarEntrega(e: Record<string, unknown>): Entrega {
  return {
    id: String(e.id),
    webhookId: String(e.webhook_id),
    evento: String(e.evento),
    situacao: (e.situacao as Entrega["situacao"]) ?? "pendente",
    tentativas: Number(e.tentativas ?? 0),
    proximaTentativaEm: String(e.proxima_tentativa_em),
    ultimoStatus: e.ultimo_status === null || e.ultimo_status === undefined ? null : Number(e.ultimo_status),
    ultimoErro: texto(e.ultimo_erro),
    entregueEm: texto(e.entregue_em),
    criadoEm: String(e.created_at),
    payload: e.payload,
  }
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function listarWebhooks(): Promise<{ disponivel: boolean; webhooks: Webhook[] }> {
  const admin = await createAdminClient()
  const { data, error } = await admin.from("webhooks").select("*").eq("emp_proprietaria_id", await tenantAtual()).order("created_at", { ascending: false })
  if (error) return { disponivel: !esquemaAusente(error), webhooks: [] }
  return { disponivel: true, webhooks: (data ?? []).map((w) => montarWebhook(w as Record<string, unknown>)) }
}

export async function salvarWebhook(id: string | null, d: { url: string; eventos: string[]; descricao: string | null; ativo: boolean }, usuarioId: string): Promise<{ id?: string; segredo?: string; erro?: string; campo?: string }> {
  let url: URL
  try {
    url = new URL(d.url.trim())
  } catch {
    return { erro: "Informe a URL completa (https://…).", campo: "url" }
  }
  if (url.protocol !== "https:" && !/^(localhost|127\.0\.0\.1)$/.test(url.hostname)) return { erro: "O webhook precisa ser HTTPS.", campo: "url" }
  const eventos = d.eventos.filter(eventoWebhookValido)
  if (eventos.length === 0) return { erro: "Marque ao menos um evento.", campo: "eventos" }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  if (id) {
    const { error } = await admin.from("webhooks").update({ url: url.toString(), eventos, descricao: d.descricao, ativo: d.ativo, updated_at: new Date().toISOString() }).eq("id", id).eq("emp_proprietaria_id", emp)
    return error ? { erro: error.message } : { id }
  }
  const segredo = `whsec_${randomBytes(24).toString("hex")}`
  const { data, error } = await admin.from("webhooks").insert({ emp_proprietaria_id: emp, url: url.toString(), segredo, eventos, descricao: d.descricao, ativo: d.ativo, criado_por: usuarioId }).select("id").single()
  if (error || !data) return { erro: error && esquemaAusente(error) ? "Falta rodar o SQL supabase/api-webhooks.sql." : (error?.message ?? "?") }
  return { id: String(data.id), segredo }
}

export async function excluirWebhook(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("webhooks").delete().eq("id", id).eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: error.message } : {}
}

export async function listarEntregas(webhookId?: string, limite = 50): Promise<Entrega[]> {
  const admin = await createAdminClient()
  let q = admin.from("webhooks_entregas").select("*").eq("emp_proprietaria_id", await tenantAtual())
  if (webhookId) q = q.eq("webhook_id", webhookId)
  const { data, error } = await q.order("created_at", { ascending: false }).limit(limite)
  if (error) return []
  return (data ?? []).map((e) => montarEntrega(e as Record<string, unknown>))
}

// ── Emissão e entrega ────────────────────────────────────────────────────────

/** Grava as entregas do evento para os webhooks inscritos e tenta entregar após a resposta. */
export async function emitirEvento(evento: EventoWebhook, payload: Record<string, unknown>, amb: Ambiente = {}): Promise<number> {
  try {
    const client = amb.client ?? (await createAdminClient())
    const tenantId = amb.tenantId ?? (await tenantAtual())
    const { data, error } = await client.from("webhooks").select("id").eq("emp_proprietaria_id", tenantId).eq("ativo", true).contains("eventos", [evento])
    if (error || !data?.length) return 0
    const corpo = { evento, entidade: tenantId, em: new Date().toISOString(), dados: payload }
    const { data: criadas, error: e2 } = await client
      .from("webhooks_entregas")
      .insert(data.map((w) => ({ emp_proprietaria_id: tenantId, webhook_id: w.id, evento, payload: corpo })))
      .select("id")
    if (e2 || !criadas?.length) return 0
    const ids = criadas.map((c) => String(c.id))
    depoisDaResposta(() => entregarPorIds(ids))
    return ids.length
  } catch (e) {
    console.error("emitirEvento:", e)
    return 0
  }
}

async function entregarUma(svc: SupabaseClient, entrega: Record<string, unknown>, webhook: Record<string, unknown>): Promise<void> {
  const id = String(entrega.id)
  const corpo = JSON.stringify(entrega.payload)
  const assinatura = createHmac("sha256", String(webhook.segredo)).update(corpo).digest("hex")
  const tentativas = Number(entrega.tentativas ?? 0) + 1
  let status: number | null = null
  let erro: string | null = null
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    const r = await fetch(String(webhook.url), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Confluir-Webhook/1",
        "X-Confluir-Evento": String(entrega.evento),
        "X-Confluir-Entrega": id,
        "X-Confluir-Assinatura": `sha256=${assinatura}`,
      },
      body: corpo,
      signal: ctrl.signal,
      redirect: "manual",
    })
    clearTimeout(timer)
    status = r.status
    if (r.status < 200 || r.status >= 300) erro = `HTTP ${r.status}`
  } catch (e) {
    erro = (e as Error).name === "AbortError" ? "Sem resposta em 10 s" : (e as Error).message
  }
  const agora = new Date().toISOString()
  if (!erro) {
    await svc.from("webhooks_entregas").update({ situacao: "entregue", tentativas, ultimo_status: status, ultimo_erro: null, entregue_em: agora }).eq("id", id)
    await svc.from("webhooks").update({ falhas_seguidas: 0, ultimo_sucesso_em: agora, ultimo_erro: null }).eq("id", String(webhook.id))
    return
  }
  const esgotou = tentativas >= MAX_TENTATIVAS
  const proxima = new Date(Date.now() + (RECUO_MINUTOS[tentativas - 1] ?? 360) * 60_000).toISOString()
  await svc.from("webhooks_entregas").update({ situacao: esgotou ? "falhou" : "pendente", tentativas, ultimo_status: status, ultimo_erro: erro.slice(0, 300), proxima_tentativa_em: proxima }).eq("id", id)
  await svc.from("webhooks").update({ falhas_seguidas: Number(webhook.falhas_seguidas ?? 0) + 1, ultimo_erro: `${erro} (${String(entrega.evento)})`.slice(0, 300) }).eq("id", String(webhook.id))
}

async function entregarPorIds(ids: string[]): Promise<void> {
  const svc = createServiceClient()
  const { data } = await svc.from("webhooks_entregas").select("*, webhook:webhook_id (*)").in("id", ids).eq("situacao", "pendente")
  for (const e of data ?? []) {
    const w = (Array.isArray(e.webhook) ? e.webhook[0] : e.webhook) as Record<string, unknown> | null
    if (w) await entregarUma(svc, e as Record<string, unknown>, w)
  }
}

/** Cron: reenvia o que está pendente e vencido (todas as entidades, ou uma). */
export async function processarEntregasPendentes(tenantId?: string, limite = 200): Promise<{ processadas: number; entregues: number }> {
  const svc = createServiceClient()
  let q = svc.from("webhooks_entregas").select("*, webhook:webhook_id (*)").eq("situacao", "pendente").lte("proxima_tentativa_em", new Date().toISOString()).order("proxima_tentativa_em").limit(limite)
  if (tenantId) q = q.eq("emp_proprietaria_id", tenantId)
  const { data, error } = await q
  if (error) return { processadas: 0, entregues: 0 }
  let entregues = 0
  for (const e of data ?? []) {
    const w = (Array.isArray(e.webhook) ? e.webhook[0] : e.webhook) as Record<string, unknown> | null
    if (!w || w.ativo === false) continue
    await entregarUma(svc, e as Record<string, unknown>, w)
    const { data: d } = await svc.from("webhooks_entregas").select("situacao").eq("id", String(e.id)).maybeSingle()
    if (d?.situacao === "entregue") entregues++
  }
  return { processadas: (data ?? []).length, entregues }
}

/** Reenvia uma entrega agora (botão da tela). */
export async function reenviarEntrega(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data } = await admin.from("webhooks_entregas").select("id").eq("id", id).eq("emp_proprietaria_id", await tenantAtual()).maybeSingle()
  if (!data) return { erro: "Entrega não encontrada." }
  await admin.from("webhooks_entregas").update({ situacao: "pendente", proxima_tentativa_em: new Date().toISOString() }).eq("id", id)
  await entregarPorIds([id])
  return {}
}
