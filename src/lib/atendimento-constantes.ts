/**
 * Atendimento ao filiado pelo portal (onda 4, F2): assuntos em lista fechada,
 * cada um com o prazo de resposta (SLA, em dias corridos) que vira o prazo da
 * Demanda no painel. Sem imports de servidor: alimenta os formulários.
 */
export const ASSUNTOS_ATENDIMENTO = [
  { chave: "juridico", rotulo: "Jurídico", descricao: "Dúvida ou pedido de orientação jurídica", slaDias: 10 },
  { chave: "saude", rotulo: "Saúde", descricao: "Serviço de saúde, agendamentos e encaminhamentos", slaDias: 5 },
  { chave: "cadastro", rotulo: "Cadastro", descricao: "Correção de dados, vínculo, matrícula ou documentos", slaDias: 3 },
  // A página de Contribuição leva para cá com ?assunto=contribuicao&titulo=… (A23).
  { chave: "contribuicao", rotulo: "Contribuição", descricao: "Desconto não repassado, valor diferente, segunda via", slaDias: 5 },
  { chave: "reembolso", rotulo: "Reembolso", descricao: "Pedido ou acompanhamento de reembolso", slaDias: 7 },
  { chave: "reclamacao", rotulo: "Reclamação", descricao: "Algo que não funcionou como deveria", slaDias: 5 },
  { chave: "outro", rotulo: "Outro assunto", descricao: "Qualquer outra solicitação", slaDias: 5 },
] as const

export type AssuntoAtendimento = (typeof ASSUNTOS_ATENDIMENTO)[number]["chave"]

export function assuntoAtendimento(chave: string | null | undefined) {
  return ASSUNTOS_ATENDIMENTO.find((a) => a.chave === chave) ?? null
}

/**
 * "jurídico, saúde, …, reclamação ou outro assunto" — para os textos que citam
 * a lista. `chaves`: só os assuntos que a entidade oferece (Área do associado).
 */
export function assuntosPorExtenso(chaves?: readonly string[]): string {
  const nomes = ASSUNTOS_ATENDIMENTO.filter((a) => !chaves || chaves.includes(a.chave)).map((a) => a.rotulo.toLowerCase())
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(", ")} ou ${nomes.at(-1)}` : (nomes[0] ?? "")
}

/** Texto de apoio do anexo por assunto: o documento que resolve o pedido. */
export const APOIO_ANEXO_ATENDIMENTO: Partial<Record<AssuntoAtendimento, string>> = {
  contribuicao: "Anexe o contracheque do mês em que o desconto aparece — assim conferimos com a empresa.",
}

export const SITUACOES_ATENDIMENTO = ["aberta", "em_andamento", "respondida", "concluida"] as const
export type SituacaoAtendimento = (typeof SITUACOES_ATENDIMENTO)[number]

export const ROTULO_SITUACAO_ATENDIMENTO: Record<SituacaoAtendimento, string> = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  respondida: "Respondida",
  concluida: "Concluída",
}

/**
 * Por quantos dias depois de concluída o próprio associado pode reabrir a
 * solicitação (A97). Depois disso, o assunto que voltou vira um pedido novo.
 * É o padrão: cada entidade escolhe o seu em Filiados › Área do associado
 * (atendimento.prazo_reabrir_dias; 0 = não se reabre pelo portal).
 */
export const PRAZO_REABRIR_DIAS = 15

/** "1 dia", "15 dias". */
export function rotuloDias(n: number): string {
  return `${n} ${n === 1 ? "dia" : "dias"}`
}

/** O que a situação significa para o filiado (`prazoReabrirDias`: o da entidade). */
export function explicacaoSituacaoAtendimento(
  situacao: SituacaoAtendimento,
  prazoReabrirDias: number = PRAZO_REABRIR_DIAS
): string {
  switch (situacao) {
    case "aberta":
      return "Recebida pela entidade; ainda sem resposta."
    case "em_andamento":
      return "A entidade está cuidando da sua solicitação."
    case "respondida":
      return "Há uma resposta da entidade para você ler. Se precisar, responda."
    case "concluida":
      return prazoReabrirDias > 0
        ? `Encerrada. Se o assunto voltar, reabra por aqui em até ${rotuloDias(prazoReabrirDias)}.`
        : "Encerrada. Se o assunto voltar, abra uma nova solicitação."
  }
}

export const ATENDIMENTO_ABERTO: SituacaoAtendimento[] = ["aberta", "em_andamento", "respondida"]
/** Esperando a equipe agir: nova ou com resposta nova do filiado ("respondida" espera o filiado). */
export const ATENDIMENTO_AGUARDANDO_EQUIPE: SituacaoAtendimento[] = ["aberta", "em_andamento"]

/** Tipo da Demanda criada no painel para cada solicitação. */
export const TIPO_DEMANDA_ATENDIMENTO = "Atendimento ao filiado"

/**
 * Estado dos formulários de atendimento: o `EstadoForm` de lib/contas mais os
 * valores enviados, devolvidos quando o servidor recusa — o React limpa os
 * campos ao fim da action, e quem escreveu um relato longo não pode perdê-lo
 * por um resumo curto ou um anexo grande (A50).
 */
export type EstadoFormAtendimento = {
  erro?: string
  campo?: string
  ok?: string
  valores?: { assunto?: string; titulo?: string; texto?: string }
}

// ── Prazo legível (A94) ──────────────────────────────────────────────────────

const DIA_SP = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" })

/** DD/MM/AAAA de um instante no fuso de São Paulo (a resposta das 22h não vira o dia seguinte). */
function diaSP(instante: string): string {
  const d = new Date(instante)
  return Number.isNaN(d.getTime()) ? "—" : DIA_SP.format(d)
}

/** DD/MM/AAAA de uma data pura (AAAA-MM-DD). */
function diaDaData(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000)
}

type PrazoDe = {
  situacao: SituacaoAtendimento
  prazo: string | null
  primeiraRespostaEm: string | null
  concluidaEm: string | null
  atrasada: boolean
}

/**
 * Uma frase sobre o prazo, do jeito que importa ao associado: concluída →
 * quando; respondida → quando a entidade respondeu (o "resposta até" de uma
 * data passada parecia erro); vencida sem resposta → admite o atraso; senão,
 * até quando e quanto falta. `hoje` em AAAA-MM-DD, no fuso de São Paulo.
 */
export function prazoLegivel(a: PrazoDe, hoje: string): string | null {
  if (a.situacao === "concluida") return a.concluidaEm ? `concluída em ${diaSP(a.concluidaEm)}` : null
  if (a.primeiraRespostaEm) return `respondida em ${diaSP(a.primeiraRespostaEm)}`
  if (!a.prazo) return null
  if (a.atrasada) return `passou do prazo de ${diaDaData(a.prazo)}; a entidade ainda vai responder`
  const faltam = diasEntre(hoje, a.prazo)
  const quando = faltam <= 0 ? "hoje" : faltam === 1 ? "amanhã" : `em ${faltam} dias`
  return `resposta até ${diaDaData(a.prazo)} (${quando})`
}

/**
 * Último dia (DD/MM/AAAA) em que o associado ainda pode reabrir; null = não
 * pode mais. `prazoDias`: o da entidade (0 = não se reabre pelo portal).
 */
export function reabrirAte(
  a: { situacao: SituacaoAtendimento; concluidaEm: string | null },
  prazoDias: number = PRAZO_REABRIR_DIAS,
  agora = Date.now()
): string | null {
  if (a.situacao !== "concluida" || !a.concluidaEm || prazoDias <= 0) return null
  const limite = Date.parse(a.concluidaEm) + prazoDias * 86_400_000
  if (!Number.isFinite(limite) || limite < agora) return null
  return diaSP(new Date(limite).toISOString())
}
