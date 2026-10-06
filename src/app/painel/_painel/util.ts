import type { Delta } from "@/components/painel/hud"

/** Variação percentual (ou absoluta, com `pct=false`) contra o valor anterior. */
export function deltaPct(atual: number, anterior: number | null | undefined, pct = true): Delta {
  if (anterior === null || anterior === undefined) return null
  const d = atual - anterior
  const sinal: -1 | 0 | 1 = d > 0 ? 1 : d < 0 ? -1 : 0
  if (pct) {
    if (anterior === 0) return null
    return { texto: `${d > 0 ? "+" : ""}${((d / Math.abs(anterior)) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`, sinal }
  }
  return { texto: `${d > 0 ? "+" : ""}${d.toLocaleString("pt-BR")}`, sinal }
}
