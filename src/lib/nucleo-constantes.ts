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
