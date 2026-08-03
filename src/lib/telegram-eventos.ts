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
  { chave: "informe", rotulo: "Informe de rendimentos liberado" },
  { chave: "reembolso", rotulo: "Reembolso avaliado" },
  { chave: "treinamento", rotulo: "Matrícula em treinamento" },
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
