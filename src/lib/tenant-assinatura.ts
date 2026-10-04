/**
 * Assinatura do tenant no cabeçalho (S18 da avaliação de 03/10). O proxy
 * resolve o tenant pelo host e o injeta em `x-tenant-id`; sem assinatura,
 * qualquer requisição que NÃO passe pelo proxy (o matcher exclui caminhos
 * terminados em .png, .svg etc.) poderia trazer o cabeçalho forjado. Aqui o
 * proxy assina o id com a chave do JWT e `tenantAtual()` só aceita o par
 * (id, assinatura) que confere. Web Crypto: serve ao proxy e ao servidor.
 */

const ALGORITMO = { name: "HMAC", hash: "SHA-256" } as const

async function chave(): Promise<CryptoKey | null> {
  const segredo = process.env.SUPABASE_JWT_SECRET
  if (!segredo) return null
  return crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), ALGORITMO, false, ["sign", "verify"])
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** Assinatura hexadecimal do id do tenant; null sem a chave configurada. */
export async function assinarTenant(tenantId: string): Promise<string | null> {
  const k = await chave()
  if (!k) return null
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(tenantId)))
}

/** Confere (em tempo constante) a assinatura do id do tenant. */
export async function conferirTenant(tenantId: string, assinatura: string | null): Promise<boolean> {
  const k = await chave()
  if (!k || !assinatura || !/^[0-9a-f]{64}$/.test(assinatura)) return false
  const bytes = Uint8Array.from(assinatura.match(/.{2}/g)!.map((h) => parseInt(h, 16)))
  return crypto.subtle.verify("HMAC", k, bytes, new TextEncoder().encode(tenantId))
}
