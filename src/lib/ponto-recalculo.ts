/**
 * RECALCULAR AS HORAS PELAS MARCAÇÕES (16/11/2026) — a parte pura.
 *
 * Depois de a gestão conferir e ajustar as marcações do mês, as horas
 * realizadas podem sair delas, com as mesmas regras da apuração pelas
 * batidas (lib/ponto-apuracao). Falta só a jornada prevista de cada dia da
 * semana, que vem, nesta ordem: do quadro do espelho guardado com as
 * marcações; da jornada de trabalho vinculada ao funcionário (Atribuições e
 * SST → Jornadas); da carga do espelho, de segunda a sexta.
 */

import type { LeituraCartao } from "@/lib/ponto-apuracao"
import type { MarcacoesEspelho } from "@/lib/ponto-marcacoes-ajuste"

export type DiaJornadaConfigurada = {
  dia_semana: number
  hora_inicio: string | null
  hora_fim: string | null
  hora_inicio_2?: string | null
  hora_fim_2?: string | null
}

export type JornadaPrevista = {
  /** 0 = domingo … 6 = sábado: horários previstos em ordem, ou só a carga. */
  dias: string[][]
  fonte: "espelho" | "jornada" | "carga"
  /** Texto para a tela ("quadro do espelho", "jornada Administrativo"…). */
  descricao: string
}

const HORA = /^([01]?\d|2[0-3]):[0-5]\d$/
const hhmm = (h: string | null | undefined) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(h ?? "").trim())
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null
}

/** A jornada configurada (linhas por dia) no formato do quadro do espelho. */
export function jornadaDosDias(dias: DiaJornadaConfigurada[]): string[][] {
  return Array.from({ length: 7 }, (_, dow) => {
    const d = dias.find((x) => x.dia_semana === dow)
    if (!d) return []
    const pares = [
      [hhmm(d.hora_inicio), hhmm(d.hora_fim)],
      [hhmm(d.hora_inicio_2), hhmm(d.hora_fim_2)],
    ].filter((p): p is [string, string] => Boolean(p[0] && p[1]))
    return pares.flat()
  })
}

/** "08:00" (carga) ou "08:00 12:00 13:00 17:00" (horários) para segunda a sexta. */
export function jornadaDaCarga(carga: string | null | undefined): string[][] | null {
  const horas = String(carga ?? "")
    .split(/\s+/)
    .map((h) => hhmm(h))
    .filter((h): h is string => Boolean(h) && HORA.test(h!))
  if (horas.length === 0 || (horas.length > 1 && horas.length % 2 === 1)) return null
  return Array.from({ length: 7 }, (_, dow) => (dow >= 1 && dow <= 5 ? [...horas] : []))
}

const temAlgo = (j: string[][] | null | undefined) => Boolean(j?.some((d) => d.length > 0))

/** Escolhe a jornada prevista; null quando não há de onde tirar. */
export function escolherJornada(
  m: MarcacoesEspelho | null,
  configurada: { nome: string; dias: DiaJornadaConfigurada[] } | null
): JornadaPrevista | null {
  if (m?.jornada && temAlgo(m.jornada)) return { dias: m.jornada, fonte: "espelho", descricao: "o quadro de horário do espelho" }
  if (configurada) {
    const dias = jornadaDosDias(configurada.dias)
    if (temAlgo(dias)) return { dias, fonte: "jornada", descricao: `a jornada "${configurada.nome}" do funcionário` }
  }
  const daCarga = jornadaDaCarga(m?.carga_diaria)
  if (daCarga) return { dias: daCarga, fonte: "carga", descricao: `a carga do espelho (${m!.carga_diaria}), de segunda a sexta` }
  return null
}

/** As marcações (com os ajustes) no formato que a apuração pelas batidas usa. */
export function leituraDasMarcacoes(m: MarcacoesEspelho, jornada: string[][]): LeituraCartao {
  return {
    nome: null,
    cpf: null,
    periodoInicio: null,
    periodoFim: null,
    departamento: m.departamento,
    jornada,
    dias: m.dias.map((d) => ({ data: d.data, ocorrencia: d.ocorrencia, marcacoes: [...d.marcacoes] })),
    totalRelatorio: null,
  }
}
