/**
 * Eventos que o bot do Telegram pode notificar (push) e seus rótulos. Fonte
 * ÚNICA compartilhada entre servidor (db/telegram.ts) e cliente (o formulário
 * de preferências) — por isso NÃO é `server-only`.
 *
 * Preferência é opt-out: ausência de chave = ligado. Quem não quer um aviso
 * grava `false` para aquela chave em `usuarios.telegram_notif_prefs` (jsonb).
 *
 * GRUPO (06/10/2026 — caixa de entrada × notificações):
 *   • "notificacao" — o que aconteceu com a pessoa: entra no SINO (histórico)
 *     e sai por e-mail/Telegram conforme a preferência;
 *   • "pendencia" — algo espera a pessoa agir: fica na CAIXA DE ENTRADA (que
 *     some quando resolvido) e só avisa por e-mail/Telegram/celular — nunca
 *     no sino;
 *   • "resumo" — lembrete e resumos periódicos: só e-mail/Telegram/celular.
 */
export type GrupoEvento = "notificacao" | "pendencia" | "resumo"

export const EVENTOS_TELEGRAM = [
  { chave: "contracheque", rotulo: "Contracheque liberado", grupo: "notificacao" },
  { chave: "ponto", rotulo: "Espelho de ponto liberado", grupo: "notificacao" },
  { chave: "ferias", rotulo: "Férias autorizadas", grupo: "notificacao" },
  { chave: "diarias", rotulo: "Diárias avaliadas", grupo: "notificacao" },
  { chave: "viagens", rotulo: "Viagem reservada, recusada ou cancelada", grupo: "notificacao" },
  { chave: "informe", rotulo: "Informe de rendimentos liberado", grupo: "notificacao" },
  { chave: "reembolso", rotulo: "Reembolso avaliado", grupo: "notificacao" },
  { chave: "treinamento", rotulo: "Matrícula em treinamento", grupo: "notificacao" },
  { chave: "pessoal_cancelamento", rotulo: "Férias ou falta cancelada depois de autorizada (quem cuida do Pessoal)", grupo: "notificacao" },
  // Avisos a quem precisa AGIR (onda 2, U2): entram só para quem tem a
  // permissão correspondente (ou coordena quem pediu).
  { chave: "pendencia_aprovacao", rotulo: "Ordem de pagamento entrou na sua alçada", grupo: "pendencia" },
  { chave: "pendencia_pessoal", rotulo: "Pedido de férias, diária, reembolso ou falta a avaliar", grupo: "pendencia" },
  { chave: "pendencia_filiacao", rotulo: "Solicitação de filiação ou reembolso jurídico a avaliar", grupo: "pendencia" },
  { chave: "pendencia_espacos", rotulo: "Pedido de uso de espaço", grupo: "pendencia" },
  { chave: "pendencia_viagens", rotulo: "Pedido de viagem a atender", grupo: "pendencia" },
  { chave: "pendencia_recebimentos", rotulo: "Fornecimento a receber", grupo: "pendencia" },
  { chave: "veiculos_manutencao", rotulo: "Revisão preventiva da frota próxima ou vencida", grupo: "pendencia" },
  { chave: "feedback_sistema", rotulo: "Relato de problema ou sugestão sobre o sistema (quem cuida das demandas)", grupo: "pendencia" },
  { chave: "atendimento_filiado", rotulo: "Solicitação ou resposta de filiado pelo portal (quem cuida das demandas)", grupo: "pendencia" },
  { chave: "lembrete_pendencias", rotulo: "Lembrete diário do que está esperando você", grupo: "resumo" },
  { chave: "resumo_vencimentos", rotulo: "Resumo diário de vencimentos das áreas que você cuida", grupo: "resumo" },
  { chave: "resumo_semanal", rotulo: "Resumo semanal de gestão (segunda-feira)", grupo: "resumo" },
] as const satisfies readonly { chave: string; rotulo: string; grupo: GrupoEvento }[]

export type EventoTelegram = (typeof EVENTOS_TELEGRAM)[number]["chave"]

/** Só os eventos do grupo "notificacao" entram no sino. */
export function entraNoSino(evento: EventoTelegram): boolean {
  return EVENTOS_TELEGRAM.find((e) => e.chave === evento)?.grupo === "notificacao"
}

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
