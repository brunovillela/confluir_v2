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

/**
 * No lugar do título de uma ata cujo sigilo está acima do nível de quem vê
 * (07/11/2026): o título pode revelar o assunto da reunião.
 */
export const TITULO_SOB_SIGILO = "(título sob sigilo)"

export const ROTULO_TIPO_REUNIAO = Object.fromEntries(
  TIPOS_REUNIAO.map((t) => [t.chave, t.rotulo])
) as Record<TipoReuniao, string>
