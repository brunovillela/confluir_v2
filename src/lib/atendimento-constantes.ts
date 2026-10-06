/**
 * Atendimento ao filiado pelo portal (onda 4, F2): assuntos em lista fechada,
 * cada um com o prazo de resposta (SLA, em dias corridos) que vira o prazo da
 * Demanda no painel. Sem imports de servidor: alimenta os formulários.
 */
export const ASSUNTOS_ATENDIMENTO = [
  { chave: "juridico", rotulo: "Jurídico", descricao: "Dúvida ou pedido de orientação jurídica", slaDias: 10 },
  { chave: "saude", rotulo: "Saúde", descricao: "Serviço de saúde, agendamentos e encaminhamentos", slaDias: 5 },
  { chave: "cadastro", rotulo: "Cadastro", descricao: "Correção de dados, vínculo, matrícula ou documentos", slaDias: 3 },
  { chave: "reembolso", rotulo: "Reembolso", descricao: "Pedido ou acompanhamento de reembolso", slaDias: 7 },
  { chave: "reclamacao", rotulo: "Reclamação", descricao: "Algo que não funcionou como deveria", slaDias: 5 },
  { chave: "outro", rotulo: "Outro assunto", descricao: "Qualquer outra solicitação", slaDias: 5 },
] as const

export type AssuntoAtendimento = (typeof ASSUNTOS_ATENDIMENTO)[number]["chave"]

export function assuntoAtendimento(chave: string | null | undefined) {
  return ASSUNTOS_ATENDIMENTO.find((a) => a.chave === chave) ?? null
}

export const SITUACOES_ATENDIMENTO = ["aberta", "em_andamento", "respondida", "concluida"] as const
export type SituacaoAtendimento = (typeof SITUACOES_ATENDIMENTO)[number]

export const ROTULO_SITUACAO_ATENDIMENTO: Record<SituacaoAtendimento, string> = {
  aberta: "Aberta",
  em_andamento: "Em andamento",
  respondida: "Respondida",
  concluida: "Concluída",
}

/** O que a situação significa para o filiado. */
export const EXPLICACAO_SITUACAO_ATENDIMENTO: Record<SituacaoAtendimento, string> = {
  aberta: "Recebida pela entidade; ainda sem resposta.",
  em_andamento: "A entidade está cuidando da sua solicitação.",
  respondida: "Há uma resposta da entidade para você ler. Se precisar, responda.",
  concluida: "Encerrada. Se o assunto voltar, abra uma nova solicitação.",
}

export const ATENDIMENTO_ABERTO: SituacaoAtendimento[] = ["aberta", "em_andamento", "respondida"]
/** Esperando a equipe agir: nova ou com resposta nova do filiado ("respondida" espera o filiado). */
export const ATENDIMENTO_AGUARDANDO_EQUIPE: SituacaoAtendimento[] = ["aberta", "em_andamento"]

/** Tipo da Demanda criada no painel para cada solicitação. */
export const TIPO_DEMANDA_ATENDIMENTO = "Atendimento ao filiado"
