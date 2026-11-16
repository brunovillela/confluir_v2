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
