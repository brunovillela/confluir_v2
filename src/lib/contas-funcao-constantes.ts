/** Contas de função — constantes que o client também usa (ver lib/db/contas-funcao.ts). */

export const MOTIVOS_OCUPACAO = [
  { valor: "titular", rotulo: "Titular do posto" },
  { valor: "ferias", rotulo: "Cobrindo férias" },
  { valor: "afastamento", rotulo: "Cobrindo afastamento" },
  { valor: "substituicao", rotulo: "Substituição temporária" },
] as const

export type MotivoOcupacao = (typeof MOTIVOS_OCUPACAO)[number]["valor"]

/** Cobertura = período temporário que vale sobre o titular nos dias dele. */
export function ehCobertura(motivo: string): boolean {
  return motivo !== "titular"
}

export function rotuloMotivo(motivo: string): string {
  return MOTIVOS_OCUPACAO.find((m) => m.valor === motivo)?.rotulo ?? motivo
}
