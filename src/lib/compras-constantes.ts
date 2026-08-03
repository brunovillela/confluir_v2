/**
 * Constantes de Compras compartilhadas entre servidor (lib/db/compras.ts) e
 * componentes client (badges, formulários) — por isso sem "server-only".
 */

export const SITUACOES_PROCESSO = [
  "solicitada",
  "em_cotacao",
  "cotada",
  "comprada",
  "recebida",
  "cancelada",
] as const

export type SituacaoProcesso = (typeof SITUACOES_PROCESSO)[number]

export const ROTULOS_SITUACAO_PROCESSO: Record<SituacaoProcesso, string> = {
  solicitada: "Solicitada",
  em_cotacao: "Em cotação",
  cotada: "Cotada",
  comprada: "Comprada",
  recebida: "Recebida",
  cancelada: "Cancelada",
}

/** Data de hoje no relógio LOCAL (AAAA-MM-DD) — default de inputs date; toISOString daria o dia UTC, que vira à frente de SP a partir das 21h. */
export function hojeLocalISO(): string {
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-")
}

/** Formas aceitas nas compras (propostas e ordens de pagamento). */
export const FORMAS_PAGAMENTO_COMPRAS = [
  "Pix",
  "Boleto",
  "Depósito bancário (TED)",
  "Cartão",
  "Dinheiro",
  "Outro",
] as const
