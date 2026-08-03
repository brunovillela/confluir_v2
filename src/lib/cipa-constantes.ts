/**
 * Saúde/CIPA — constantes e tipos client-safe.
 *
 * Separado de db/cipa.ts porque aquele traz `server-only`: componentes
 * client não podem importar dele nem para pegar um tipo. Mesma convenção de
 * compras-constantes.ts, veiculos-constantes.ts e assembleias-constantes.ts.
 */

export const SITUACOES_CIPA = [
  { valor: "convidado", rotulo: "Convidado" },
  { valor: "compareceu", rotulo: "Compareceu" },
  { valor: "nao_compareceu", rotulo: "Não compareceu" },
  { valor: "recusado", rotulo: "Recusado" },
] as const

export type SituacaoCipa = (typeof SITUACOES_CIPA)[number]["valor"]

export type RepresentanteCipa = {
  id: string
  usuario_id: string | null
  filiado_id: string | null
  nome: string | null
  compareceu: boolean
  /** Nome resolvido: do usuário, do filiado, ou o digitado. */
  nomeExibicao: string
}

export type ReuniaoCipa = {
  id: string
  data_reuniao: string | null
  empresa_id: string | null
  unidade: string | null
  ordinaria: boolean | null
  online: boolean | null
  demanda_embarque: boolean | null
  convite_recebido_em: string | null
  situacao: string
  motivo_ausencia: string | null
  motivo_especifico: string | null
  assuntos: string | null
  observacoes: string | null
  ata_arquivo: string | null
  empresaNome: string | null
  representantes: RepresentanteCipa[]
}
