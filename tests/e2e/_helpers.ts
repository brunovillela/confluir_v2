import { createHmac } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import type { Page } from "playwright/test"

/** Lê .env.local sem dotenv (o projeto não o tem). */
function lerEnv(): Record<string, string> {
  try {
    const texto = readFileSync(path.join(process.cwd(), ".env.local"), "utf8")
    return Object.fromEntries(
      texto
        .split("\n")
        .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
        .map((l) => {
          const i = l.indexOf("=")
          return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
        })
    )
  } catch {
    return {}
  }
}

export const ENV = { ...lerEnv(), ...process.env } as Record<string, string | undefined>

export const DEMO = {
  tenant: "11111111-1111-4111-8111-111111111111",
  operador: { email: "demo@confluir.local", authId: "a0fc0457-ffe0-4e49-8d7b-2a1563e7e64a", usuarioId: "22222222-2222-4222-8222-222222222222" },
  camila: { cpf: "66677788830", email: "camila.demo@exemplo.com" },
}

export function servico(): SupabaseClient {
  const url = ENV.NEXT_PUBLIC_SUPABASE_URL
  const chave = ENV.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são necessários para os testes E2E.")
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } })
}

/** Link mágico (token_hash) para a conta; cria a conta se não existir. */
export async function tokenDeEntrada(email: string): Promise<string> {
  const { data, error } = await servico().auth.admin.generateLink({ type: "magiclink", email })
  if (error || !data?.properties?.hashed_token) throw new Error(`generateLink: ${error?.message}`)
  return data.properties.hashed_token
}

/** Código OTP (o mesmo que o app manda por e-mail). */
export async function codigoDeEntrada(email: string): Promise<string> {
  const { data, error } = await servico().auth.admin.generateLink({ type: "magiclink", email })
  if (error || !data?.properties?.email_otp) throw new Error(`generateLink: ${error?.message}`)
  return data.properties.email_otp
}

export async function entrarPorLink(page: Page, email: string, next: string): Promise<void> {
  const token = await tokenDeEntrada(email)
  await page.goto(`/auth/confirm?token_hash=${token}&type=magiclink&next=${encodeURIComponent(next)}`)
}

export async function contaPorEmail(email: string): Promise<{ id: string } | null> {
  const { data } = await servico().auth.admin.listUsers({ page: 1, perPage: 1000 })
  const u = (data?.users ?? []).find((x) => (x.email ?? "").toLowerCase() === email.toLowerCase())
  return u ? { id: u.id } : null
}

/** Apaga a conta Auth e os rastros de identidade/cadência de um e-mail de teste. */
export async function limparContaDeTeste(email: string, cpf?: string): Promise<void> {
  const svc = servico()
  const conta = await contaPorEmail(email)
  if (conta) {
    await svc.from("auth_identidades").delete().eq("auth_user_id", conta.id)
    await svc.auth.admin.deleteUser(conta.id)
  }
  await svc.from("auth_vinculos_pendentes").delete().eq("emp_proprietaria_id", DEMO.tenant).eq("email", email.toLowerCase())
  await svc.from("auth_codigos_envios").delete().eq("emp_proprietaria_id", DEMO.tenant).eq("email", email.toLowerCase())
  if (cpf) await svc.from("portal_nao_filiado").delete().eq("emp_proprietaria_id", DEMO.tenant).eq("cpf", cpf)
}

export async function removerFatores2FA(authId: string): Promise<void> {
  const svc = servico()
  const { data } = await svc.auth.admin.mfa.listFactors({ userId: authId })
  for (const f of data?.factors ?? []) await svc.auth.admin.mfa.deleteFactor({ id: f.id, userId: authId })
}

// ── TOTP (RFC 6238), para o teste do 2FA ──────────────────────────────────

function base32(s: string): Buffer {
  const a = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
  let bits = ""
  for (const c of s.toUpperCase().replace(/=+$/, "")) {
    const v = a.indexOf(c)
    if (v >= 0) bits += v.toString(2).padStart(5, "0")
  }
  const out: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(out)
}

export function totp(segredo: string, passo = Math.floor(Date.now() / 1000 / 30)): string {
  const msg = Buffer.alloc(8)
  msg.writeBigUInt64BE(BigInt(passo))
  const h = createHmac("sha1", base32(segredo)).update(msg).digest()
  const o = h[19] & 0xf
  return ((h.readUInt32BE(o) & 0x7fffffff) % 1e6).toString().padStart(6, "0")
}

/** Espera a janela virar quando falta pouco, para o código não expirar no caminho. */
export async function totpSeguro(segredo: string): Promise<string> {
  const restam = 30 - (Math.floor(Date.now() / 1000) % 30)
  if (restam < 6) await new Promise((r) => setTimeout(r, (restam + 1) * 1000))
  return totp(segredo)
}
