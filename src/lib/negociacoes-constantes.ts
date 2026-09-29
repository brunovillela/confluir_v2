/**
 * Constantes de Negociações sindicais, compartilhadas entre client e server
 * (FORA de `server-only` — badges e forms importam daqui).
 */

export const SITUACOES_NEGOCIACAO = [
  { chave: "preparacao", rotulo: "Preparação da pauta" },
  { chave: "em_curso", rotulo: "Em negociação" },
  { chave: "concluida", rotulo: "Concluída (acordo fechado)" },
  { chave: "encerrada", rotulo: "Encerrada sem acordo" },
] as const
export type SituacaoNegociacao = (typeof SITUACOES_NEGOCIACAO)[number]["chave"]

export const ROTULO_SITUACAO_NEGOCIACAO: Record<SituacaoNegociacao, string> = Object.fromEntries(
  SITUACOES_NEGOCIACAO.map((s) => [s.chave, s.rotulo])
) as Record<SituacaoNegociacao, string>

export function situacaoNegociacao(v: unknown): SituacaoNegociacao {
  return SITUACOES_NEGOCIACAO.some((s) => s.chave === v) ? (v as SituacaoNegociacao) : "preparacao"
}

/** Papel do documento na negociação (é uma linha de acordo_coletivo). */
export const PAPEIS_DOCUMENTO = [
  {
    chave: "pauta",
    rotulo: "Pauta de reivindicações",
    explicacao: "O que a categoria aprovou pedir. Entra na coluna do meio do quadro comparativo.",
  },
  {
    chave: "proposta",
    rotulo: "Proposta da empresa",
    explicacao: "Texto que a empresa apresentou em uma rodada.",
  },
  {
    chave: "contraproposta",
    rotulo: "Contraproposta do sindicato",
    explicacao: "Resposta do sindicato a uma proposta da empresa.",
  },
  {
    chave: "final",
    rotulo: "Acordo final",
    explicacao: "Texto fechado. Ao concluir a negociação, vira o acordo vigente.",
  },
] as const
export type PapelDocumento = (typeof PAPEIS_DOCUMENTO)[number]["chave"]

export const ROTULO_PAPEL: Record<PapelDocumento, string> = {
  pauta: "Pauta",
  proposta: "Proposta da empresa",
  contraproposta: "Contraproposta",
  final: "Acordo final",
}

export function papelDocumento(v: unknown): PapelDocumento | null {
  return PAPEIS_DOCUMENTO.some((p) => p.chave === v) ? (v as PapelDocumento) : null
}

/** Acontecimentos registrados à mão na linha do tempo. */
export const TIPOS_EVENTO = [
  { chave: "reuniao", rotulo: "Reunião de negociação" },
  { chave: "mediacao", rotulo: "Mediação (MTE, TST, MPT)" },
  { chave: "mobilizacao", rotulo: "Mobilização / greve" },
  { chave: "comunicado", rotulo: "Comunicado / boletim" },
  { chave: "outro", rotulo: "Outro" },
] as const
export type TipoEvento = (typeof TIPOS_EVENTO)[number]["chave"]

export const ROTULO_EVENTO: Record<TipoEvento, string> = Object.fromEntries(
  TIPOS_EVENTO.map((t) => [t.chave, t.rotulo])
) as Record<TipoEvento, string>

export function tipoEvento(v: unknown): TipoEvento {
  return TIPOS_EVENTO.some((t) => t.chave === v) ? (v as TipoEvento) : "outro"
}
