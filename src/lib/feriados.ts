/**
 * Feriados nacionais (fixos + móveis pela Páscoa). Módulo puro: usado na
 * validação do início do gozo (lib/db/ferias.ts) e no prazo de pagamento das
 * férias em dias úteis (lib/ferias-pagamento.ts).
 */

const paraISO = (d: Date) => d.toISOString().slice(0, 10)

/** Domingo de Páscoa (algoritmo de Meeus/Jones/Butcher). */
function pascoa(ano: number): Date {
  const a = ano % 19
  const b = Math.floor(ano / 100)
  const c = ano % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(ano, mes - 1, dia))
}

/** Feriados nacionais do ano (fixos + Carnaval, Sexta-feira Santa, Corpus Christi). */
export function feriadosNacionais(ano: number): Set<string> {
  const fixos = [
    "01-01", // Confraternização Universal
    "04-21", // Tiradentes
    "05-01", // Dia do Trabalho
    "09-07", // Independência
    "10-12", // Nossa Senhora Aparecida
    "11-02", // Finados
    "11-15", // Proclamação da República
    "11-20", // Consciência Negra (Lei 14.759/2023)
    "12-25", // Natal
  ]
  const feriados = new Set(fixos.map((f) => `${ano}-${f}`))
  const domingoPascoa = pascoa(ano)
  const mover = (dias: number) => {
    const d = new Date(domingoPascoa)
    d.setUTCDate(d.getUTCDate() + dias)
    return paraISO(d)
  }
  feriados.add(mover(-47)) // Carnaval (terça)
  feriados.add(mover(-2)) // Sexta-feira Santa
  feriados.add(mover(60)) // Corpus Christi
  return feriados
}

/** Dia útil: nem sábado, nem domingo, nem feriado nacional. */
export function ehDiaUtil(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`)
  const semana = d.getUTCDay()
  if (semana === 0 || semana === 6) return false
  return !feriadosNacionais(d.getUTCFullYear()).has(iso)
}
