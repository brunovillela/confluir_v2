/**
 * Tipos de ausência — lista FECHADA (decisão de 23/09/2026).
 *
 * O campo `motivo` veio do Bubble já como lista, mas era texto livre no
 * formulário e recebeu descrições soltas. Agora o tipo é escolhido daqui e o
 * detalhe (qual seminário, qual licença) vai para a observação.
 */
export const TIPOS_AUSENCIA = [
  "Falta justificada",
  "Afastamento médico",
  "Férias",
  "Compensação de banco de horas",
  "Trabalho externo",
  "Licença",
] as const

export type TipoAusencia = (typeof TIPOS_AUSENCIA)[number]

export function tipoDeAusenciaValido(valor: string | null | undefined): valor is TipoAusencia {
  return TIPOS_AUSENCIA.includes((valor ?? "").trim() as TipoAusencia)
}
