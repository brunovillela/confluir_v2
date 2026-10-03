/**
 * Eventos que o bot do Telegram pode notificar (push) e seus rótulos. Fonte
 * ÚNICA compartilhada entre servidor (db/telegram.ts) e cliente (o formulário
 * de preferências) — por isso NÃO é `server-only`.
 *
 * Preferência é opt-out: ausência de chave = ligado. Quem não quer um aviso
 * grava `false` para aquela chave em `usuarios.telegram_notif_prefs` (jsonb).
 */
export const EVENTOS_TELEGRAM = [
  { chave: "contracheque", rotulo: "Contracheque liberado" },
  { chave: "ponto", rotulo: "Espelho de ponto liberado" },
  { chave: "ferias", rotulo: "Férias autorizadas" },
  { chave: "diarias", rotulo: "Diárias avaliadas" },
  { chave: "viagens", rotulo: "Viagem reservada, recusada ou cancelada" },
  { chave: "informe", rotulo: "Informe de rendimentos liberado" },
  { chave: "reembolso", rotulo: "Reembolso avaliado" },
  { chave: "treinamento", rotulo: "Matrícula em treinamento" },
  { chave: "veiculos_manutencao", rotulo: "Revisão preventiva da frota próxima ou vencida" },
  // Avisos a quem precisa AGIR (onda 2, U2): entram só para quem tem a
  // permissão correspondente — os demais nunca os recebem.
  { chave: "pendencia_aprovacao", rotulo: "Ordem de pagamento entrou na sua alçada" },
  { chave: "pendencia_pessoal", rotulo: "Pedido de férias, diária, reembolso ou falta a avaliar" },
  { chave: "pendencia_filiacao", rotulo: "Solicitação de filiação ou reembolso de filiado a avaliar" },
  { chave: "pendencia_espacos", rotulo: "Pedido de uso de espaço" },
  { chave: "pendencia_viagens", rotulo: "Pedido de viagem a atender" },
  { chave: "pendencia_recebimentos", rotulo: "Fornecimento a receber" },
  { chave: "lembrete_pendencias", rotulo: "Lembrete diário do que está esperando você" },
] as const

export type EventoTelegram = (typeof EVENTOS_TELEGRAM)[number]["chave"]

export type PreferenciasTelegram = Record<EventoTelegram, boolean>

/** Normaliza o jsonb cru em prefs completas (opt-out: ausente/≠false = ligado). */
export function normalizarPreferencias(bruto: unknown): PreferenciasTelegram {
  const obj =
    bruto && typeof bruto === "object" ? (bruto as Record<string, unknown>) : {}
  const prefs = {} as PreferenciasTelegram
  for (const { chave } of EVENTOS_TELEGRAM) {
    prefs[chave] = obj[chave] !== false
  }
  return prefs
}
