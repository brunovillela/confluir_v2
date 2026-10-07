/**
 * Eventos que o bot do Telegram pode notificar (push) e seus rótulos. Fonte
 * ÚNICA compartilhada entre servidor (db/telegram.ts) e cliente (o formulário
 * de preferências) — por isso NÃO é `server-only`.
 *
 * Preferência é OPT-IN desde 07/10/2026: ausência de chave = desligado. A
 * pessoa liga, por canal, o que quer receber em Meu perfil → Avisos
 * (`usuarios.notif_email_prefs`, `telegram_notif_prefs` e
 * `push_notif_prefs`, jsonb).
 *
 * ACESSO: aviso que traz informação de uma área só aparece (e só pode ser
 * ligado) para quem tem a permissão daquela área — as mesmas que o envio usa
 * para escolher os destinatários. Aviso sobre a própria pessoa (contracheque,
 * férias…) aparece para quem é do quadro; sem `acesso`, vale para todos.
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

/**
 * Quem pode ligar o aviso: quem tiver uma das `permissoes` — ou, com
 * `coordenador`, quem coordena um departamento. Com `alcada`, além da
 * permissão é preciso alçada de aprovação. `quadro` é para os avisos sobre a
 * própria pessoa: só funcionário, ou funcionário e diretor.
 */
type Acesso = {
  permissoes?: readonly string[]
  coordenador?: boolean
  alcada?: boolean
  quadro?: "funcionario" | "funcionario_ou_diretor"
}

/** Áreas do resumo de vencimentos (lib/db/vencimentos.ts → vencimentosDoTenant). */
const PERMISSOES_VENCIMENTOS = [
  "aquisicoes_contratos",
  "aquisicoes_contratos_edicao",
  "apoio_institucional",
  "apoio_institucional_edicao",
  "acordos_coletivos",
  "veiculos_gestao",
  "pessoal_gestao",
  "pessoal_aso",
  "viagens_gestao",
  "financeiro_pagamento",
  "financeiro_leitura",
  "diretoria_mandatos",
  "configuracoes",
  "filiacao_convenios",
  "filiacao_gestao",
  "saude_cat",
  "saude_atendimento",
  "saude_gestao",
] as const

export const EVENTOS_TELEGRAM = [
  { chave: "contracheque", rotulo: "Contracheque liberado", grupo: "notificacao", acesso: { quadro: "funcionario" } },
  { chave: "ponto", rotulo: "Espelho de ponto liberado", grupo: "notificacao", acesso: { quadro: "funcionario" } },
  { chave: "ferias", rotulo: "Férias autorizadas", grupo: "notificacao", acesso: { quadro: "funcionario" } },
  { chave: "diarias", rotulo: "Diárias avaliadas", grupo: "notificacao", acesso: { quadro: "funcionario_ou_diretor" } },
  { chave: "viagens", rotulo: "Viagem reservada, recusada ou cancelada", grupo: "notificacao", acesso: { quadro: "funcionario_ou_diretor" } },
  { chave: "informe", rotulo: "Informe de rendimentos liberado", grupo: "notificacao", acesso: { quadro: "funcionario" } },
  { chave: "reembolso", rotulo: "Reembolso avaliado", grupo: "notificacao", acesso: { quadro: "funcionario" } },
  { chave: "treinamento", rotulo: "Matrícula em treinamento", grupo: "notificacao", acesso: { quadro: "funcionario" } },
  { chave: "pessoal_cancelamento", rotulo: "Férias ou falta cancelada depois de autorizada (quem cuida do Pessoal)", grupo: "notificacao", acesso: { permissoes: ["pessoal_gestao", "pessoal_faltas_justificadas"], coordenador: true } },
  // Avisos a quem precisa AGIR (onda 2, U2): entram só para quem tem a
  // permissão correspondente (ou coordena quem pediu).
  { chave: "pendencia_aprovacao", rotulo: "Ordem de pagamento entrou na sua alçada", grupo: "pendencia", acesso: { permissoes: ["aquisicoes_avaliacoes", "financeiro_pagamento"], alcada: true } },
  { chave: "pendencia_pessoal", rotulo: "Pedido de férias, diária, reembolso ou falta a avaliar", grupo: "pendencia", acesso: { permissoes: ["pessoal_gestao", "pessoal_diarias", "pessoal_faltas_justificadas", "diretoria_diarias", "configuracoes"], coordenador: true } },
  { chave: "pendencia_filiacao", rotulo: "Solicitação de filiação ou reembolso jurídico a avaliar", grupo: "pendencia", acesso: { permissoes: ["filiacao_gestao", "juridico_gestao", "juridico_geral"] } },
  { chave: "pendencia_espacos", rotulo: "Pedido de uso de espaço", grupo: "pendencia", acesso: { permissoes: ["espacos", "espacos_gestao"] } },
  { chave: "pendencia_viagens", rotulo: "Pedido de viagem a atender", grupo: "pendencia", acesso: { permissoes: ["viagens_gestao"] } },
  { chave: "pendencia_recebimentos", rotulo: "Fornecimento a receber", grupo: "pendencia", acesso: { permissoes: ["aquisicoes_recebimentos", "aquisicoes_compras_edicao"] } },
  { chave: "pendencia_caixa", rotulo: "Despesa lançada no seu caixa a reconhecer, ou despesa sua não reconhecida", grupo: "pendencia" },
  { chave: "veiculos_manutencao", rotulo: "Revisão preventiva da frota próxima ou vencida", grupo: "pendencia", acesso: { permissoes: ["veiculos_gestao"] } },
  { chave: "feedback_sistema", rotulo: "Relato de problema ou sugestão sobre o sistema (quem cuida das demandas)", grupo: "pendencia", acesso: { permissoes: ["ferramentas_demandas", "ferramentas_tarefas"] } },
  { chave: "atendimento_filiado", rotulo: "Solicitação ou resposta de filiado pelo portal (quem cuida das demandas)", grupo: "pendencia", acesso: { permissoes: ["ferramentas_demandas", "ferramentas_tarefas"] } },
  { chave: "lembrete_pendencias", rotulo: "Lembrete diário do que está esperando você", grupo: "resumo" },
  { chave: "resumo_vencimentos", rotulo: "Resumo diário de vencimentos das áreas que você cuida", grupo: "resumo", acesso: { permissoes: PERMISSOES_VENCIMENTOS } },
  { chave: "resumo_semanal", rotulo: "Resumo semanal de gestão (segunda-feira)", grupo: "resumo" },
] as const satisfies readonly { chave: string; rotulo: string; grupo: GrupoEvento; acesso?: Acesso }[]

export type EventoTelegram = (typeof EVENTOS_TELEGRAM)[number]["chave"]

/** Só os eventos do grupo "notificacao" entram no sino. */
export function entraNoSino(evento: EventoTelegram): boolean {
  return EVENTOS_TELEGRAM.find((e) => e.chave === evento)?.grupo === "notificacao"
}

export type PreferenciasTelegram = Record<EventoTelegram, boolean>

/** Normaliza o jsonb cru em prefs completas (opt-in: só `true` liga). */
export function normalizarPreferencias(bruto: unknown): PreferenciasTelegram {
  const obj =
    bruto && typeof bruto === "object" ? (bruto as Record<string, unknown>) : {}
  const prefs = {} as PreferenciasTelegram
  for (const { chave } of EVENTOS_TELEGRAM) {
    prefs[chave] = obj[chave] === true
  }
  return prefs
}

/** O que decide quais avisos a pessoa pode ligar. */
export type PerfilDeAvisos = {
  permissoes: Record<string, unknown> | null
  /** Coordena algum departamento. */
  coordenador: boolean
  /** Tem alçada de aprovação de ordens (> 0). */
  alcada: boolean
  /** É funcionário (quadro de pessoal). */
  funcionario: boolean
  /** Integra a diretoria do mandato vigente. */
  diretor: boolean
}

/** A pessoa pode ligar este aviso? (Meu perfil → Avisos e a gravação.) */
export function eventoPermitido(evento: EventoTelegram, perfil: PerfilDeAvisos): boolean {
  const def = EVENTOS_TELEGRAM.find((e) => e.chave === evento)
  if (!def) return false
  if (!("acesso" in def)) return true
  const acesso: Acesso = def.acesso
  if (acesso.quadro) return perfil.funcionario || (acesso.quadro === "funcionario_ou_diretor" && perfil.diretor)
  if (acesso.alcada && !perfil.alcada) return false
  const temPermissao = (acesso.permissoes ?? []).some((c) => perfil.permissoes?.[c] === true)
  return temPermissao || (Boolean(acesso.coordenador) && perfil.coordenador)
}
