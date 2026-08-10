/**
 * Patrimônio — constantes compartilhadas (client + server).
 * `db/patrimonio.ts` é server-only e importa daqui.
 */

export const AVISO_SQL_PATRIMONIO =
  "Patrimônio ainda não configurado — rode supabase/patrimonio.sql no SQL Editor do Supabase."

export type SituacaoItem = "ativos" | "inativos" | "todos"

/**
 * Valores do enum `public.sedes_enum` (coluna `patrimonio_recinto.sede`).
 * Fonte da verdade: o tipo no banco — manter em sincronia se o enum mudar.
 */
export const SEDES_RECINTO = [
  "Macaé",
  "Campos",
  "Rio das Ostras",
  "Quissamã",
  "Carapebus",
  "Outro",
] as const
export type SedeRecinto = (typeof SEDES_RECINTO)[number]
