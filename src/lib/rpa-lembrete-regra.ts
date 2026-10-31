/**
 * Regra dos lembretes da assinatura do RPA (onda 3 do plano do RPA), pura
 * para ser testada: a partir do último contato com o prestador (envio,
 * reenvio ou lembrete) e de quantos lembretes já saíram, o que fazer hoje.
 */

export const DIAS_LEMBRETE = 3
export const MAX_LEMBRETES = 2

export type AcaoLembrete = "nada" | "lembrete" | "esgotar"

export function proximaAcaoLembrete(p: {
  /** Instantes (ms) dos contatos: envio, reenvios e lembretes. */
  contatos: number[]
  lembretesFeitos: number
  /** Quem emitiu já foi avisado de que os lembretes acabaram. */
  esgotado: boolean
  agora: number
}): AcaoLembrete {
  if (p.esgotado) return "nada"
  const validos = p.contatos.filter((n) => Number.isFinite(n))
  if (!validos.length) return "nada"
  if (Math.max(...validos) > p.agora - DIAS_LEMBRETE * 864e5) return "nada"
  return p.lembretesFeitos < MAX_LEMBRETES ? "lembrete" : "esgotar"
}
