import { createHmac, randomBytes } from "node:crypto"

/**
 * Código da sala (prova de presença nível C): muda a cada `periodo` segundos.
 * É um HMAC do número da janela com a semente da sessão, que nunca sai do
 * servidor. Aceita a janela atual e a anterior, para quem leu no último
 * segundo. Só no servidor (node:crypto).
 */

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

export function novaSemente(): string {
  return randomBytes(24).toString("base64url")
}

export function janela(instante: number, periodo: number): number {
  return Math.floor(instante / 1000 / Math.max(5, periodo))
}

export function codigoDaJanela(semente: string, j: number): string {
  const h = createHmac("sha256", semente).update(String(j)).digest()
  let c = ""
  for (let i = 0; i < 6; i++) c += ALFABETO[h[i] % ALFABETO.length]
  return c
}

export function codigoAtual(semente: string, periodo: number, agora = Date.now()): { codigo: string; validoAte: number } {
  const j = janela(agora, periodo)
  return { codigo: codigoDaJanela(semente, j), validoAte: (j + 1) * Math.max(5, periodo) * 1000 }
}

export function codigoValido(semente: string, periodo: number, codigo: string, agora = Date.now()): boolean {
  const j = janela(agora, periodo)
  const c = codigo.trim().toUpperCase()
  return c === codigoDaJanela(semente, j) || c === codigoDaJanela(semente, j - 1)
}

/**
 * O código foi desta sala nos últimos `minutos` (já fora da validade)? Serve
 * só para a mensagem: "expirou, leia de novo" para quem copiou devagar, e
 * "não confere" para código digitado errado ou de outra sala.
 */
export function codigoRecente(semente: string, periodo: number, codigo: string, agora = Date.now(), minutos = 30): boolean {
  const j = janela(agora, periodo)
  const c = codigo.trim().toUpperCase()
  const voltas = Math.ceil((minutos * 60) / Math.max(5, periodo))
  for (let k = 2; k <= voltas; k++) if (c === codigoDaJanela(semente, j - k)) return true
  return false
}
