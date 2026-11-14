/**
 * Constantes do núcleo de ferramentas (Demandas · Tarefas · Anomalias) seguras
 * para o client — sem `server-only`. Ver [[confluir-ferramentas-administrativas]].
 */

/** Situação de uma Demanda (kanban herdado do Bubble). */
export const SITUACOES_DEMANDA = ["A fazer", "Fazendo", "Feito"] as const
export type SituacaoDemanda = (typeof SITUACOES_DEMANDA)[number]

/** Situação derivada de uma Tarefa (não é coluna — vem de `concluido` + prazo). */
export type SituacaoTarefa = "concluida" | "atrasada" | "pendente"

export const ROTULOS_SITUACAO_TAREFA: Record<SituacaoTarefa, string> = {
  concluida: "Concluída",
  atrasada: "Atrasada",
  pendente: "Pendente",
}

export function derivarSituacaoTarefa(
  concluido: boolean | null,
  prazo: string | null,
  hojeISO: string
): SituacaoTarefa {
  if (concluido === true) return "concluida"
  if (prazo && prazo < hojeISO) return "atrasada"
  return "pendente"
}

/** Tipo do pai de uma Tarefa (polimórfico e opcional). */
export const TIPOS_PAI_TAREFA = ["demanda", "projeto", "anomalia"] as const
export type TipoPaiTarefa = (typeof TIPOS_PAI_TAREFA)[number]

export const ROTULOS_PAI_TAREFA: Record<TipoPaiTarefa, string> = {
  demanda: "Demanda",
  projeto: "Projeto",
  anomalia: "Anomalia",
}

/** Etapas do tratamento de uma Anomalia (RCA), derivadas dos flags. */
export type EstagioAnomalia =
  | "registrada"
  | "investigada"
  | "tratada"
  | "verificada"

export const ROTULOS_ESTAGIO_ANOMALIA: Record<EstagioAnomalia, string> = {
  registrada: "Registrada",
  investigada: "Investigada",
  tratada: "Tratada",
  verificada: "Eficácia verificada",
}

export function derivarEstagioAnomalia(a: {
  anomalia_investigada?: boolean | null
  anomalia_tratada?: boolean | null
  eficacia_verificada?: boolean | null
}): EstagioAnomalia {
  if (a.eficacia_verificada) return "verificada"
  if (a.anomalia_tratada) return "tratada"
  if (a.anomalia_investigada) return "investigada"
  return "registrada"
}

/** Texto do aviso antes de finalizar: as tarefas abertas serão concluídas junto. */
export function avisoTarefasAoFinalizar(pendentes: number, de: "demanda" | "projeto"): { titulo: string; descricao: string; confirmar: string } {
  return {
    titulo: de === "projeto" ? "Finalizar o projeto?" : "Finalizar a demanda?",
    descricao: `${pendentes === 1 ? "A tarefa ainda aberta" : `As ${pendentes} tarefas ainda abertas`} ${de === "projeto" ? "deste projeto" : "desta demanda"} ${pendentes === 1 ? "será finalizada" : "serão finalizadas"} junto, com a data de hoje. Reabrir depois não as reabre.`,
    confirmar: "Finalizar",
  }
}

/** Prioridade da tarefa (coluna `prioridade`; padrão "media"). */
export const PRIORIDADES_TAREFA = ["alta", "media", "baixa"] as const
export type PrioridadeTarefa = (typeof PRIORIDADES_TAREFA)[number]

export const ROTULOS_PRIORIDADE_TAREFA: Record<PrioridadeTarefa, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
}

export function ehPrioridadeTarefa(v: unknown): v is PrioridadeTarefa {
  return typeof v === "string" && (PRIORIDADES_TAREFA as readonly string[]).includes(v)
}

/** Ordem das listas de tarefas. */
export const ORDENS_TAREFAS = ["prazo", "prioridade"] as const
export type OrdemTarefas = (typeof ORDENS_TAREFAS)[number]

/**
 * Ordena sem mexer na lista recebida. Prazo: o mais próximo primeiro, sem
 * prazo no fim. Prioridade: alta, média, baixa e, dentro do nível, o prazo.
 * Em qualquer ordem, as concluídas vão para o fim.
 */
export function ordenarTarefas<T extends { prazo: string | null; prioridade: PrioridadeTarefa; concluido: boolean; titulo: string | null }>(
  tarefas: readonly T[],
  ordem: OrdemTarefas
): T[] {
  const prazo = (a: T, b: T) => (a.prazo ?? "9999-99-99").localeCompare(b.prazo ?? "9999-99-99")
  const nivel = (t: T) => PRIORIDADES_TAREFA.indexOf(t.prioridade)
  return [...tarefas].sort(
    (a, b) =>
      Number(a.concluido) - Number(b.concluido) ||
      (ordem === "prioridade" ? nivel(a) - nivel(b) : 0) ||
      prazo(a, b) ||
      (a.titulo ?? "").localeCompare(b.titulo ?? "", "pt-BR")
  )
}
