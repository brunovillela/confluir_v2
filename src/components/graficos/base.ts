/**
 * Gráficos do painel (onda 3, I2) — SVG próprio, sem biblioteca. Regras que
 * todos seguem (ver skill dataviz): marcas finas (coluna ≤ 24px, ponta
 * arredondada 4px, linha 2px, marcador ≥ 8px com anel de 2px da superfície),
 * vão de 2px entre colunas, grade hairline recessiva, texto sempre em tokens
 * de texto (nunca na cor da série), legenda para ≥ 2 séries, tooltip em todo
 * gráfico e tabela por baixo (o valor nunca depende só do hover).
 *
 * Cores: ordem fixa validada em claro e escuro com o validador da skill
 * (laranja, azul, verde, dourado; "Outros" em cinza neutro). A série recebe a
 * cor pela ordem em que entra e a mantém quando as outras somem.
 */

export const CORES_SERIES = [
  "var(--graf-1)",
  "var(--graf-2)",
  "var(--graf-3)",
  "var(--graf-4)",
] as const

export const COR_OUTROS = "var(--graf-outros)"

/** Número compacto para eixos e rótulos: 1.284 → "1,3 mil"; 4.200.000 → "4,2 mi". */
export function compacto(v: number, moeda = false): string {
  const abs = Math.abs(v)
  const sinal = v < 0 ? "-" : ""
  const pre = moeda ? "R$ " : ""
  if (abs >= 1_000_000) return `${sinal}${pre}${(abs / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`
  if (abs >= 1_000) return `${sinal}${pre}${(abs / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`
  return `${sinal}${pre}${abs.toLocaleString("pt-BR", { maximumFractionDigits: moeda ? 2 : 0 })}`
}

export function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/** "2026-03-01" → "mar/26". */
export function rotuloMes(iso: string): string {
  const [a, m] = iso.split("-").map(Number)
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"]
  return `${nomes[(m ?? 1) - 1]}/${String(a).slice(2)}`
}

/** Ticks "redondos" do eixo Y: 4 passos a partir do máximo. */
export function ticks(max: number, passos = 4): number[] {
  if (max <= 0) return [0]
  const bruto = max / passos
  const pot = 10 ** Math.floor(Math.log10(bruto))
  const norm = bruto / pot
  const passo = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * pot
  const n = Math.ceil(max / passo)
  return Array.from({ length: n + 1 }, (_, i) => i * passo)
}
