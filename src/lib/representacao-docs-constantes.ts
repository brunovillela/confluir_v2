/**
 * Categorias da documentação legal de um empregador (representação sindical).
 * Client-safe (usado por forms) — não importa de server-only.
 */
export const TIPOS_DOC_REPRESENTACAO = [
  { chave: "carta_sindical", rotulo: "Carta sindical" },
  { chave: "ata", rotulo: "Ata" },
  { chave: "edital", rotulo: "Edital" },
  { chave: "procuracao", rotulo: "Procuração" },
  { chave: "acordo", rotulo: "Acordo / Convenção" },
  { chave: "outro", rotulo: "Outro" },
] as const

export type TipoDocRepresentacao =
  (typeof TIPOS_DOC_REPRESENTACAO)[number]["chave"]

export const ROTULO_TIPO_DOC = Object.fromEntries(
  TIPOS_DOC_REPRESENTACAO.map((t) => [t.chave, t.rotulo])
) as Record<TipoDocRepresentacao, string>
