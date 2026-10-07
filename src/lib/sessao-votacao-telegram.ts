import "server-only"

import { createHmac, timingSafeEqual } from "node:crypto"

import { cookies } from "next/headers"

import { tenantAtual } from "@/lib/tenant"

/**
 * Sessão de quem confirmou pelo TELEGRAM no link único de votação
 * (07/10/2026): cookie assinado com o chat e o número que o Telegram
 * confirmou, preso à entidade. Faz o papel da sessão do e-mail confirmado —
 * nada vai ao banco além do vínculo do apto.
 */

const COOKIE_SESSAO = "confluir_votacao_tg"
const COOKIE_PENDENTE = "confluir_votacao_tg_token"
const TTL_SESSAO = 60 * 60 * 24 // 24 h
const TTL_PENDENTE = 60 * 15 // 15 min, a validade do token

function assinar(corpo: string): string {
  const s = process.env.SUPABASE_JWT_SECRET
  if (!s) throw new Error("SUPABASE_JWT_SECRET ausente")
  // Rótulo próprio: uma assinatura deste cookie nunca vale para outro.
  return createHmac("sha256", `${s}:votacao-telegram`).update(corpo).digest("base64url")
}

function confere(corpo: string, assinatura: string): boolean {
  const esperado = Buffer.from(assinar(corpo))
  const veio = Buffer.from(assinatura)
  return esperado.length === veio.length && timingSafeEqual(esperado, veio)
}

const opcoes = (maxAge: number) => ({
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge,
  path: "/",
})

export type SessaoTelegram = { chatId: string; telefone: string }

export async function abrirSessaoTelegram(s: SessaoTelegram): Promise<void> {
  const corpo = Buffer.from(
    JSON.stringify({ c: s.chatId, t: s.telefone, e: await tenantAtual(), exp: Math.floor(Date.now() / 1000) + TTL_SESSAO })
  ).toString("base64url")
  const jar = await cookies()
  jar.set(COOKIE_SESSAO, `${corpo}.${assinar(corpo)}`, opcoes(TTL_SESSAO))
  jar.delete(COOKIE_PENDENTE)
}

export async function sessaoTelegram(): Promise<SessaoTelegram | null> {
  const jar = await cookies()
  const valor = jar.get(COOKIE_SESSAO)?.value
  if (!valor) return null
  const [corpo, sig] = valor.split(".")
  if (!corpo || !sig || !confere(corpo, sig)) return null
  try {
    const o = JSON.parse(Buffer.from(corpo, "base64url").toString()) as { c?: string; t?: string; e?: string; exp?: number }
    if (!o.c || !o.t || !o.exp || o.exp < Math.floor(Date.now() / 1000)) return null
    if (o.e !== (await tenantAtual())) return null
    return { chatId: o.c, telefone: o.t }
  } catch {
    return null
  }
}

export async function encerrarSessaoTelegram(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE_SESSAO)
  jar.delete(COOKIE_PENDENTE)
}

/** O token em espera fica num cookie: a consulta não aceita token de fora. */
export async function guardarTokenPendente(token: string): Promise<void> {
  const jar = await cookies()
  jar.set(COOKIE_PENDENTE, token, opcoes(TTL_PENDENTE))
}

export async function tokenPendente(): Promise<string | null> {
  const jar = await cookies()
  return jar.get(COOKIE_PENDENTE)?.value ?? null
}

/** "+5522999991234" → "•••• 1234". */
export function telefoneMascarado(telefone: string): string {
  const d = telefone.replace(/\D/g, "")
  return d.length >= 4 ? `•••• ${d.slice(-4)}` : "••••"
}
