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

/** Mesmo dia, `anos` anos depois (29/02 sem par cai em 01/03). */
export function somarAnosISO(iso: string, anos: number): string {
  const d = paraUTC(iso)
  d.setUTCFullYear(d.getUTCFullYear() + anos)
  return d.toISOString().slice(0, 10)
}

/**
 * Datas de um período de férias a partir do início do aquisitivo: aquisitivo
 * de 1 ano (término = 1 ano − 1 dia), concessivo nos 12 meses seguintes
 * (início = 1 ano; término = 2 anos − 1 dia). Sugestão no formulário e
 * complemento das datas deixadas em branco ao gravar.
 */
export function datasDoPeriodoFerias(aquisitivoInicio: string): {
  aquisitivoTermino: string
  concessivoInicio: string
  concessivoTermino: string
} {
  const umAno = somarAnosISO(aquisitivoInicio, 1)
  return {
    aquisitivoTermino: somarDiasISO(umAno, -1),
    concessivoInicio: umAno,
    concessivoTermino: somarDiasISO(somarAnosISO(aquisitivoInicio, 2), -1),
  }
}
