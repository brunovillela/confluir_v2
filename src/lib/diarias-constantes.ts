/**
 * Constantes de diárias compartilhadas entre client e server (fora de
 * `server-only`). O enum legado `financeiro_diarias.diaria` é a CATEGORIA da
 * diária (escopo da viagem) e é NOT NULL — todo tipo precisa de um valor.
 */
export const CATEGORIAS_DIARIA = [
  "Nacional",
  "Internacional",
  "Local",
  "Outro",
] as const

export type CategoriaDiaria = (typeof CATEGORIAS_DIARIA)[number]

export const CATEGORIA_DIARIA_PADRAO: CategoriaDiaria = "Nacional"

export function categoriaDiariaValida(v: string): CategoriaDiaria {
  return (CATEGORIAS_DIARIA as readonly string[]).includes(v)
    ? (v as CategoriaDiaria)
    : CATEGORIA_DIARIA_PADRAO
}
