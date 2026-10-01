/**
 * Agenda — tipos e regras PURAS (fora do `server-only`: o formulário usa).
 * Leitura e gravação: src/lib/db/agenda.ts. SQL: supabase/agenda-avulsa.sql.
 */

/**
 * Tipos de compromisso. "Atividade sindical" e "Equipamento" vêm do Bubble;
 * "Evento" é o que Eventos grava; os demais são para o compromisso avulso.
 */
export const TIPOS_AGENDA = [
  "Atividade sindical",
  "Reunião",
  "Assembleia",
  "Curso",
  "Evento",
  "Evento social",
  "Equipamento",
  "Outro",
] as const

/** Tipos oferecidos ao criar à mão ("Evento" é o espelho do módulo Eventos). */
export const TIPOS_AGENDA_AVULSA = TIPOS_AGENDA.filter((t) => t !== "Evento")

/** De onde veio o compromisso — só o avulso é editado na própria Agenda. */
export type OrigemAgenda = "avulso" | "evento" | "votacao"

export function origemDaAgenda(linha: {
  evento_id?: unknown
  assembleia_id?: unknown
}): OrigemAgenda {
  if (linha.evento_id) return "evento"
  if (linha.assembleia_id) return "votacao"
  return "avulso"
}

export const TITULO_MAX_AGENDA = 200
