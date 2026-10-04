/**
 * CÓDIGO DA CARTEIRINHA DIGITAL (onda 4, F1). O QR da carteirinha aponta para
 * `/verificar/<código>`; o código é o id da filiação assinado (HMAC com a
 * chave do JWT), então não precisa de tabela nem expira: a verificação lê a
 * condição ATUAL do cadastro — desfiliou, o QR passa a dizer que não há
 * filiação ativa. Quem tem o código não descobre nada além do que a página
 * pública mostra (nome, matrícula, condição).
 */

const ALGORITMO = { name: "HMAC", hash: "SHA-256" } as const
const CONTEXTO = "carteirinha:"
const TAMANHO = 16

async function chave(): Promise<CryptoKey | null> {
  const segredo = process.env.SUPABASE_JWT_SECRET
  if (!segredo) return null
  return crypto.subtle.importKey("raw", new TextEncoder().encode(segredo), ALGORITMO, false, ["sign"])
}

async function assinatura(filiacaoId: string): Promise<string | null> {
  const k = await chave()
  if (!k) return null
  const mac = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(CONTEXTO + filiacaoId))
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("").slice(0, TAMANHO)
}

/** Código do QR: `<id da filiação>.<assinatura>`; null sem a chave configurada. */
export async function codigoCarteirinha(filiacaoId: string): Promise<string | null> {
  const s = await assinatura(filiacaoId)
  return s ? `${filiacaoId}.${s}` : null
}

/** Confere o código e devolve o id da filiação, ou null se foi adulterado. */
export async function conferirCodigoCarteirinha(codigo: string): Promise<string | null> {
  const m = /^([0-9a-f-]{36})\.([0-9a-f]{16})$/i.exec(codigo.trim())
  if (!m) return null
  const esperada = await assinatura(m[1].toLowerCase())
  if (!esperada) return null
  // comparação em tempo constante
  let diff = 0
  for (let i = 0; i < TAMANHO; i++) diff |= esperada.charCodeAt(i) ^ m[2].toLowerCase().charCodeAt(i)
  return diff === 0 ? m[1].toLowerCase() : null
}
