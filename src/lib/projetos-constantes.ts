/**
 * Constantes de Projetos seguras para o client (sem `server-only`).
 * A tabela `projeto` (101 registros migrados do Bubble) usa estes valores em
 * `tipo`; `descricao_sumaria` é o título do projeto e `detalhamento` o texto
 * longo. O campo `estrategico` existe no schema mas nunca foi usado no legado.
 */

export const TIPOS_PROJETO = [
  "Atividades sindicais",
  "Eventos culturais",
  "Obras e reformas",
] as const

export type TipoProjeto = (typeof TIPOS_PROJETO)[number]

/** Situação derivada de `finalizado` (o legado não tem coluna de status). */
export const SITUACOES_PROJETO = ["andamento", "finalizados", "todos"] as const

export type SituacaoProjetoFiltro = (typeof SITUACOES_PROJETO)[number]

export function rotuloSituacaoProjeto(finalizado: boolean | null): string {
  return finalizado ? "Finalizado" : "Em andamento"
}
