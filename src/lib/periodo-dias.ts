/**
 * Contagem de dias de férias, atestados, licenças e afastamentos — o dia de
 * INÍCIO conta como o primeiro dia (decisão de 01/10/2026). Assim, 10 dias a
 * partir de 01/10 vão até 10/10, e o retorno ao trabalho é 11/10.
 *
 * `termino` gravado no banco é sempre o ÚLTIMO dia do período (inclusivo).
 * Serve ao servidor e ao cliente (sem "server-only").
 */

const DIA_MS = 86_400_000

function paraUTC(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

export function somarDiasISO(iso: string, dias: number): string {
  const d = paraUTC(iso)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Último dia do período: início + dias − 1. */
export function ultimoDiaDoPeriodo(inicioISO: string, dias: number): string {
  return somarDiasISO(inicioISO, dias - 1)
}

/** Dia seguinte ao último — a volta ao trabalho. */
export function retornoDoPeriodo(inicioISO: string, dias: number): string {
  return somarDiasISO(inicioISO, dias)
}

/** Quantidade de dias entre início e último dia, contando os dois. */
export function diasDoPeriodo(inicioISO: string, terminoISO: string): number {
  return Math.round((paraUTC(terminoISO).getTime() - paraUTC(inicioISO).getTime()) / DIA_MS) + 1
}

/** Lê "dias" de um formulário: inteiro positivo ou null. */
export function lerDias(valor: unknown): number | null {
  const n = Number(String(valor ?? "").trim())
  return Number.isInteger(n) && n > 0 ? n : null
}

const ISO = /^\d{4}-\d{2}-\d{2}$/

export function ehDataISO(valor: string): boolean {
  return ISO.test(valor)
}
