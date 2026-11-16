/**
 * Comparação entre anos nos indicadores do ponto (16/11/2026) — a parte pura:
 * variação percentual, o texto dela e o rótulo do "mesmo período". O ano
 * corrente costuma estar pela metade; por isso a tela compara a MÉDIA POR
 * MÊS com remessa e, à parte, o mesmo intervalo de meses do ano anterior.
 */

export const MESES_CURTOS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]

/** Variação de `anterior` para `atual`, em %; null quando não há base (anterior zero). */
export function variacaoPct(atual: number, anterior: number): number | null {
  if (!Number.isFinite(atual) || !Number.isFinite(anterior) || anterior === 0) return null
  return Math.round(((atual - anterior) / Math.abs(anterior)) * 100)
}

/** "+12%", "−22%", "igual" ou "—" (sem base). */
export function textoVariacao(p: number | null): string {
  if (p === null) return "—"
  if (p === 0) return "igual"
  return `${p > 0 ? "+" : "−"}${Math.abs(p)}%`
}

/** Meses 1..ate como "Jan–Out" (ou só "Jan"). */
export function rotuloAteMes(ate: number): string {
  const m = Math.min(12, Math.max(1, Math.trunc(ate)))
  return m === 1 ? MESES_CURTOS[0] : `${MESES_CURTOS[0]}–${MESES_CURTOS[m - 1]}`
}
