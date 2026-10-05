/**
 * Tipos de aviso que o portal do associado entrega (onda 4, F4). Cada um
 * pode ser desligado por e-mail pelo próprio filiado; o sino sempre recebe.
 * Sem imports de servidor: a lista alimenta o formulário de preferências.
 */
export const EVENTOS_PORTAL = [
  {
    chave: "hospedagem",
    rotulo: "Hospedagem",
    descricao: "Cupom reservado pelo hotel, reserva confirmada e vaga liberada na lista de espera",
  },
  {
    chave: "eventos",
    rotulo: "Eventos",
    descricao: "Inscrição confirmada, recusada ou em lista de espera; evento adiado ou cancelado",
  },
  {
    chave: "votacao",
    rotulo: "Votações",
    descricao: "Votação aberta em que você está apto a votar",
  },
  {
    chave: "atendimento",
    rotulo: "Atendimento",
    descricao: "Resposta ou mudança de situação de uma solicitação sua",
  },
  {
    chave: "contribuicao",
    rotulo: "Contribuição",
    descricao: "Cobrança do mês disponível por Pix e confirmação do pagamento",
  },
] as const

export type EventoPortal = (typeof EVENTOS_PORTAL)[number]["chave"]

/** Preferência por evento: ausência = ligado; `false` desliga. */
export type PreferenciasPortal = Record<EventoPortal, boolean>

export function normalizarPreferenciasPortal(bruto: unknown): PreferenciasPortal {
  const obj = bruto && typeof bruto === "object" ? (bruto as Record<string, unknown>) : {}
  const prefs = {} as PreferenciasPortal
  for (const { chave } of EVENTOS_PORTAL) prefs[chave] = obj[chave] !== false
  return prefs
}
