import { intervalo } from "../periodos"

/** Períodos do inventário da IA. "Desde o início" é o acumulado. */
export const PERIODOS_INVENTARIO = [
  { valor: "tudo", rotulo: "Desde o início" },
  { valor: "ano", rotulo: "Este ano" },
  { valor: "90d", rotulo: "90 dias" },
  { valor: "30d", rotulo: "30 dias" },
  { valor: "mes", rotulo: "Este mês" },
  { valor: "mes_anterior", rotulo: "Mês passado" },
] as const

/** O registro de uso da IA começou em 19/11/2026; "tudo" pega desde antes disso. */
const INICIO = new Date("2026-01-01T03:00:00Z")

export function intervaloInventario(periodo: string, agora = new Date()): { de: Date; ate: Date } {
  if (periodo === "tudo") return { de: INICIO, ate: new Date(agora.getTime() + 60_000) }
  return intervalo(periodo, agora)
}

export function rotuloInventario(periodo: string): string {
  return PERIODOS_INVENTARIO.find((p) => p.valor === periodo)?.rotulo ?? "Desde o início"
}
