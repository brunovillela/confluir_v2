import { somarDias } from "./deliberacoes-constantes"

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


// ── Carteira: situação calculada do projeto ─────────────────────────────────

/** Marco vencendo em até tantos dias deixa o projeto em "Atenção". */
export const DIAS_AVISO_MARCO = 7

export type NivelProjeto = "atrasado" | "atencao" | "no_prazo" | "finalizado"

export const ROTULOS_NIVEL_PROJETO: Record<NivelProjeto, string> = {
  atrasado: "Atrasado",
  atencao: "Atenção",
  no_prazo: "No prazo",
  finalizado: "Finalizado",
}

/** Ordem da carteira: o que pede ação primeiro. */
export const ORDEM_NIVEL_PROJETO: Record<NivelProjeto, number> = { atrasado: 0, atencao: 1, no_prazo: 2, finalizado: 3 }

function dataCurta(iso: string): string {
  const [, m, d] = iso.split("-")
  return `${d}/${m}`
}

/**
 * Situação do projeto na carteira, com os motivos (para a tela explicar):
 *  • Atrasado — marco com a data vencida e não concluído, ou o término
 *    previsto já passou sem o projeto ser finalizado;
 *  • Atenção — tarefas atrasadas, marco vencendo em até DIAS_AVISO_MARCO
 *    dias ou o solicitado em Aquisição passou do orçamento;
 *  • No prazo — nada disso. Projeto finalizado é só "Finalizado".
 */
export function situacaoDoProjeto(
  p: {
    finalizado: boolean
    terminoPrevisao: string | null
    marcos: { titulo: string; dataPrevista: string; concluido: boolean }[]
    tarefasAtrasadas: number
    saldo: number | null
  },
  hojeISO: string
): { nivel: NivelProjeto; motivos: string[] } {
  if (p.finalizado) return { nivel: "finalizado", motivos: [] }
  const abertos = p.marcos.filter((m) => !m.concluido).sort((a, b) => a.dataPrevista.localeCompare(b.dataPrevista))
  const atrasos: string[] = []
  for (const m of abertos.filter((m) => m.dataPrevista < hojeISO)) {
    atrasos.push(`Marco "${m.titulo}" venceu em ${dataCurta(m.dataPrevista)}`)
  }
  if (p.terminoPrevisao && p.terminoPrevisao < hojeISO) {
    atrasos.push(`Término previsto em ${dataCurta(p.terminoPrevisao)} passou`)
  }
  if (atrasos.length) return { nivel: "atrasado", motivos: atrasos }

  const atencao: string[] = []
  if (p.tarefasAtrasadas > 0) {
    atencao.push(`${p.tarefasAtrasadas} tarefa${p.tarefasAtrasadas === 1 ? "" : "s"} atrasada${p.tarefasAtrasadas === 1 ? "" : "s"}`)
  }
  const limite = somarDias(hojeISO, DIAS_AVISO_MARCO)
  for (const m of abertos.filter((m) => m.dataPrevista <= limite)) {
    atencao.push(`Marco "${m.titulo}" vence em ${dataCurta(m.dataPrevista)}`)
  }
  if (p.saldo != null && p.saldo < 0) atencao.push("Solicitado em Aquisição passou do orçamento")
  return atencao.length ? { nivel: "atencao", motivos: atencao } : { nivel: "no_prazo", motivos: [] }
}
