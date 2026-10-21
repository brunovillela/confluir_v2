/**
 * Horas do controle de ponto: o banco guarda horas DECIMAIS (10,5 = 10h30) —
 * é o decimal que vai à contabilidade —, mas quem lança e quem lê pensa em
 * horas e minutos. Estes ajudantes convertem entre os dois (sem server-only:
 * o formulário usa no navegador).
 */

/** Decimal → "HH:MM" (com sinal quando negativo). Arredonda ao minuto. */
export function hhmm(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  const minutos = Math.round(Math.abs(v) * 60)
  const h = Math.floor(minutos / 60)
  const m = minutos % 60
  return `${v < 0 && minutos > 0 ? "−" : ""}${h}:${String(m).padStart(2, "0")}`
}

/** Decimal com duas casas, no formato brasileiro (o que vai à contabilidade). */
export function decimalHoras(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/**
 * Texto digitado → horas decimais. Aceita "HH:MM" (10:30), "10h30", só horas
 * (10) e, por compatibilidade, decimal com vírgula ou ponto (10,5). Sinal de
 * menos permitido. Vazio → null; inválido → NaN.
 */
export function lerHoras(texto: string): number | null {
  const t = texto.trim().replace(/\s+/g, "").replace("−", "-")
  if (t === "") return null
  const hm = /^(-)?(\d{1,4})(?::|h)(\d{1,2})?$/i.exec(t)
  if (hm) {
    const minutos = Number(hm[3] ?? 0)
    if (minutos > 59) return NaN
    const v = Number(hm[2]) + minutos / 60
    return hm[1] ? -v : v
  }
  if (/^-?\d{1,4}([.,]\d+)?$/.test(t)) return Number(t.replace(",", "."))
  return NaN
}

/** Arredonda às duas casas que o banco guarda. */
export function duasCasas(v: number): number {
  return Math.round(v * 100) / 100
}
