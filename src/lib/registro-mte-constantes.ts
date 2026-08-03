/**
 * Registro sindical da entidade no Ministério do Trabalho e Emprego (MTE).
 * Client-safe (usado por forms) — não importa de server-only.
 */
export const TIPOS_REGISTRO_MTE = [
  { chave: "registro_sindical", rotulo: "Registro sindical" },
  { chave: "cnes", rotulo: "CNES" },
  { chave: "carta_sindical", rotulo: "Carta sindical" },
] as const

export type TipoRegistroMte = (typeof TIPOS_REGISTRO_MTE)[number]["chave"]

export const SITUACOES_REGISTRO_MTE = [
  { chave: "ativo", rotulo: "Ativo" },
  { chave: "em_analise", rotulo: "Em análise" },
  { chave: "cancelado", rotulo: "Cancelado" },
] as const

export type SituacaoRegistroMte =
  (typeof SITUACOES_REGISTRO_MTE)[number]["chave"]

export const ROTULO_TIPO_REGISTRO = Object.fromEntries(
  TIPOS_REGISTRO_MTE.map((t) => [t.chave, t.rotulo])
) as Record<TipoRegistroMte, string>

export const ROTULO_SITUACAO_REGISTRO = Object.fromEntries(
  SITUACOES_REGISTRO_MTE.map((s) => [s.chave, s.rotulo])
) as Record<SituacaoRegistroMte, string>
