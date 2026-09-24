import "server-only"

import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto"

/**
 * A mecânica compartilhada da assinatura eletrônica — o que vale para
 * QUALQUER documento assinável (ofício, termo de cessão): o código enviado por
 * e-mail, o certificado público e o hash que prende a assinatura ao conteúdo.
 *
 * Aqui só há função pura. O que é de cada documento — de onde sai o texto, o
 * que acontece quando todos assinam — vive no módulo daquele documento.
 */

export const FUSO_ASSINATURA = "America/Sao_Paulo"
export const VALIDADE_CODIGO_MIN = 10
export const MAX_TENTATIVAS_CODIGO = 5

/** Código de 6 dígitos enviado ao assinante (prova de posse da caixa). */
export function gerarCodigoAssinatura(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0")
}

/** O código NUNCA é guardado em claro: só o hash salgado pelo token do link. */
export function hashCodigo(codigo: string, token: string): string {
  return createHash("sha256").update(`${codigo}:${token}`).digest("hex")
}

export function conferirCodigo(codigo: string, token: string, hash: string): boolean {
  const a = Buffer.from(hashCodigo(codigo, token))
  const b = Buffer.from(hash)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Certificado público: 12 caracteres sem ambíguos (0/O, 1/I/L), em trincas de 4. */
export function novoCertificado(): string {
  const alfabeto = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"
  const bytes = randomBytes(12)
  const c = Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("")
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`
}

/** SHA-256 de um texto — o hash que prende a assinatura ao conteúdo assinado. */
export function hashTexto(texto: string): string {
  return createHash("sha256").update(texto).digest("hex")
}

export function formatarMomentoAssinatura(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  const data = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_ASSINATURA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d)
  const hora = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_ASSINATURA,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(d)
  return `${data} às ${hora}`
}

/** "joao.silva@x.org" → "jo***@x.org" — o certificado circula fora da entidade. */
export function mascararEmailAssinatura(email: string | null): string {
  if (!email) return "—"
  const [usuario, dominio] = email.split("@")
  if (!dominio) return email
  return `${usuario.slice(0, 2)}***@${dominio}`
}
