/**
 * Atas de reunião — tipos de reunião. Client-safe (usado por forms/listas) —
 * não importa de server-only.
 */
export const TIPOS_REUNIAO = [
  { chave: "diretoria", rotulo: "Diretoria" },
  { chave: "conselho_fiscal", rotulo: "Conselho fiscal" },
  { chave: "assembleia", rotulo: "Assembleia" },
  { chave: "outra", rotulo: "Outra" },
] as const

export type TipoReuniao = (typeof TIPOS_REUNIAO)[number]["chave"]

export const ROTULO_TIPO_REUNIAO = Object.fromEntries(
  TIPOS_REUNIAO.map((t) => [t.chave, t.rotulo])
) as Record<TipoReuniao, string>
