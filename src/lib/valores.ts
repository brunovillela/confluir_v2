/** '1.234,56' | '1234,56' | '1234.56' → número (ou null se inválido). */
export function parseValorBR(bruto: string): number | null {
  const v = bruto.trim()
  if (!v) return null
  const normalizado = v.includes(",")
    ? v.replace(/\./g, "").replace(",", ".")
    : v
  const n = Number(normalizado.replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) ? n : null
}
