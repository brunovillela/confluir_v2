/**
 * Tipos de aviso que o portal do associado entrega (onda 4, F4). Cada um
 * pode ser desligado pelo próprio filiado — a mesma chave vale para o e-mail
 * e para o celular (A52); o sino sempre recebe.
 * Sem imports de servidor: a lista alimenta o formulário de preferências.
 */
export const EVENTOS_PORTAL = [
  {
    chave: "contribuicao",
    rotulo: "Contribuição",
    descricao: "Contribuição não localizada na remessa da sua fonte pagadora; cobrança Pix disponível, perto de vencer e paga",
  },
  {
    chave: "atendimento",
    rotulo: "Atendimento",
    descricao: "Recebimento da sua solicitação, resposta da entidade e mudança de situação",
  },
  {
    chave: "hospedagem",
    rotulo: "Hospedagem",
    descricao: "Reserva feita, confirmada ou cancelada; vaga liberada na lista de espera; registro de não comparecimento",
  },
  {
    chave: "votacao",
    rotulo: "Votações",
    descricao: "Votação aberta em que você está apto a votar, último dia para votar e resultado publicado",
  },
  {
    chave: "eventos",
    rotulo: "Eventos",
    descricao: "Inscrição recebida, confirmada, recusada ou em lista de espera; lembrete na véspera; evento adiado ou cancelado",
  },
  {
    chave: "filiacao",
    rotulo: "Filiação e oposição",
    descricao: "Filiação ativada, desfiliação concluída e oposição à contribuição registrada ou avaliada",
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
