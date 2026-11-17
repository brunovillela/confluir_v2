import { ehDiaUtil } from "@/lib/feriados"

/**
 * Prazo para iniciar a cotação (16/11/2026). Módulo puro: a Área do comprador
 * e o lembrete diário contam do mesmo jeito.
 */

/** Sem configuração gravada, o comprador tem 3 dias úteis. */
export const PRAZO_COTACAO_PADRAO = 3

function proximoDia(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Dias úteis passados desde a solicitação (o dia dela não conta; hoje conta).
 * Feriados nacionais e fins de semana ficam de fora.
 */
export function diasUteisDesde(dataSolicitacao: string | null, hoje: string): number {
  if (!dataSolicitacao) return 0
  let dia = dataSolicitacao.slice(0, 10)
  let n = 0
  // Teto de segurança: uma solicitação de anos atrás não trava o laço.
  for (let i = 0; i < 1000 && dia < hoje; i++) {
    dia = proximoDia(dia)
    if (ehDiaUtil(dia)) n++
  }
  return n
}

/** Passou do prazo? (prazo null = sem prazo) */
export function cotacaoForaDoPrazo(dataSolicitacao: string | null, hoje: string, prazo: number | null): boolean {
  return prazo !== null && diasUteisDesde(dataSolicitacao, hoje) > prazo
}

// ── Entrega esperada (16/11/2026) ──────────────────────────────────────────

/** Sem previsão nem prazo da solicitação, espera-se a entrega em 15 dias da compra. */
export const DIAS_ENTREGA_SEM_PRAZO = 15

export type EntregaEsperada = {
  data: string
  /** De onde veio a data: a previsão do fornecedor, o prazo pedido ou a regra dos 15 dias. */
  origem: "previsao" | "prazo_solicitacao" | "padrao"
}

/**
 * Quando o fornecimento deveria chegar: a previsão de entrega; sem ela, o
 * "receber até" da solicitação; sem nenhum dos dois, 15 dias depois da compra.
 */
export function entregaEsperada(
  previsao: string | null,
  prazoSolicitacao: string | null,
  dataCompra: string | null
): EntregaEsperada | null {
  if (previsao) return { data: previsao.slice(0, 10), origem: "previsao" }
  if (prazoSolicitacao) return { data: prazoSolicitacao.slice(0, 10), origem: "prazo_solicitacao" }
  if (!dataCompra) return null
  const d = new Date(`${dataCompra.slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + DIAS_ENTREGA_SEM_PRAZO)
  return { data: d.toISOString().slice(0, 10), origem: "padrao" }
}

/** Dias corridos de atraso (0 = no prazo ou sem data). */
export function diasDeAtraso(esperada: string | null, hoje: string): number {
  if (!esperada || esperada >= hoje) return 0
  return Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(`${esperada}T12:00:00Z`)) / 86_400_000)
}
