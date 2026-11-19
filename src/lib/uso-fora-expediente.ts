/**
 * Uso do painel fora do expediente — conta pura (sem banco).
 *
 * Recebe os blocos de uso de uma pessoa (pessoal_uso_painel: início e fim em
 * UTC), a jornada vinculada, os feriados e os dias de afastamento (férias,
 * atestado, falta) e devolve, dia a dia, quanto do uso caiu dentro da jornada
 * e quanto caiu fora — separado em antes da entrada, intervalo, depois da
 * saída, dia sem expediente, feriado e afastamento.
 *
 * Fuso: São Paulo, UTC−3 fixo (sem horário de verão desde 2019) — o mesmo do
 * AlertaForaJornada.
 */

import { horaParaMinutos, type JornadaDia } from "@/lib/pessoal-sst-constantes"

export type BlocoUso = { inicio: string; fim: string }

export type CategoriaFora = "antes" | "intervalo" | "depois" | "sem_expediente" | "feriado" | "afastado"

export const CATEGORIAS_FORA: { chave: CategoriaFora; rotulo: string; dica: string }[] = [
  { chave: "antes", rotulo: "Antes da entrada", dica: "Em dia de trabalho, antes do horário de entrada" },
  { chave: "depois", rotulo: "Depois da saída", dica: "Em dia de trabalho, depois do horário de saída" },
  { chave: "intervalo", rotulo: "No intervalo", dica: "Entre os dois turnos (intervalo de refeição e descanso)" },
  { chave: "sem_expediente", rotulo: "Dia sem expediente", dica: "Dia da semana sem horário na jornada (ex.: sábado e domingo)" },
  { chave: "feriado", rotulo: "Feriado", dica: "Feriado nacional" },
  { chave: "afastado", rotulo: "Férias ou afastamento", dica: "Dia de férias, atestado, falta ou outra ausência registrada" },
]

/** Variação diária que não conta (por analogia ao art. 58, § 1º, da CLT). */
export const TOLERANCIA_DIARIA_MIN = 10

const FUSO_MS = -3 * 60 * 60 * 1000
const DIA_MIN = 24 * 60
const NOMES_DIA = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"]

export type TrechoUso = { inicio: number; fim: number; categoria: CategoriaFora | "dentro" }

export type DiaUso = {
  data: string
  diaSemana: number
  /** Domingo, Segunda… */
  nomeDia: string
  /** Por que o dia inteiro é fora (feriado, motivo da ausência, sem expediente); null em dia de trabalho. */
  situacao: string | null
  total: number
  dentro: number
  fora: Record<CategoriaFora, number>
  foraTotal: number
  /** Fora que conta: em dia de trabalho, até a tolerância diária vale zero. */
  considerado: number
  trechos: TrechoUso[]
}

export type ResumoUso = {
  total: number
  dentro: number
  fora: Record<CategoriaFora, number>
  foraTotal: number
  considerado: number
  diasComFora: number
  diasAcimaTolerancia: number
  /** Data (AAAA-MM-DD) do último dia com uso fora. */
  ultimoDiaFora: string | null
}

export function foraVazio(): Record<CategoriaFora, number> {
  return { antes: 0, intervalo: 0, depois: 0, sem_expediente: 0, feriado: 0, afastado: 0 }
}

/** ISO em UTC → minutos desde a época no horário de São Paulo. */
function minutosLocais(iso: string): number {
  return (new Date(iso).getTime() + FUSO_MS) / 60000
}

function dataDoDia(diaEpoca: number): string {
  return new Date(diaEpoca * DIA_MIN * 60000).toISOString().slice(0, 10)
}

/** Une blocos sobrepostos (duas abas abertas geram blocos paralelos). */
function unir(intervalos: [number, number][]): [number, number][] {
  const ord = intervalos.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
  const out: [number, number][] = []
  for (const [a, b] of ord) {
    const ult = out.at(-1)
    if (ult && a <= ult[1]) ult[1] = Math.max(ult[1], b)
    else out.push([a, b])
  }
  return out
}

/** Faixas do dia de trabalho: [início, fim, categoria] cobrindo 0–1440. */
function faixasDoDia(d: JornadaDia | undefined): [number, number, CategoriaFora | "dentro"][] | null {
  if (!d) return null
  const i1 = horaParaMinutos(d.hora_inicio)
  const f1 = horaParaMinutos(d.hora_fim)
  if (i1 === null || f1 === null || f1 <= i1) return null
  const i2 = horaParaMinutos(d.hora_inicio_2 ?? null)
  const f2 = horaParaMinutos(d.hora_fim_2 ?? null)
  const faixas: [number, number, CategoriaFora | "dentro"][] = [[0, i1, "antes"], [i1, f1, "dentro"]]
  let ultimo = f1
  if (i2 !== null && f2 !== null && i2 > f1 && f2 > i2) {
    faixas.push([f1, i2, "intervalo"], [i2, f2, "dentro"])
    ultimo = f2
  }
  faixas.push([ultimo, DIA_MIN, "depois"])
  return faixas.filter(([a, b]) => b > a)
}

const arred = (n: number) => Math.round(n)

export function apurarUso(
  blocos: BlocoUso[],
  jornada: JornadaDia[],
  opcoes: { feriados: Set<string>; afastamentos: Map<string, string> }
): DiaUso[] {
  const unidos = unir(blocos.map((b) => [minutosLocais(b.inicio), minutosLocais(b.fim)]))
  // Pedaços por dia: diaEpoca → [início, fim] em minutos do dia.
  const porDia = new Map<number, [number, number][]>()
  for (const [a, b] of unidos) {
    for (let dia = Math.floor(a / DIA_MIN); dia * DIA_MIN < b; dia++) {
      const ini = Math.max(a, dia * DIA_MIN) - dia * DIA_MIN
      const fim = Math.min(b, (dia + 1) * DIA_MIN) - dia * DIA_MIN
      if (fim > ini) porDia.set(dia, [...(porDia.get(dia) ?? []), [ini, fim]])
    }
  }
  const dias: DiaUso[] = []
  for (const dia of [...porDia.keys()].sort((x, y) => x - y)) {
    const data = dataDoDia(dia)
    const diaSemana = new Date(`${data}T12:00:00Z`).getUTCDay()
    const afastado = opcoes.afastamentos.get(data)
    const feriado = opcoes.feriados.has(data)
    const faixas = faixasDoDia(jornada.find((j) => j.dia_semana === diaSemana))
    let situacao: string | null = null
    let todoDia: CategoriaFora | null = null
    if (afastado !== undefined) [situacao, todoDia] = [afastado || "Afastamento", "afastado"]
    else if (feriado) [situacao, todoDia] = ["Feriado", "feriado"]
    else if (!faixas) [situacao, todoDia] = ["Sem expediente", "sem_expediente"]
    const fora = foraVazio()
    let dentro = 0
    const trechos: TrechoUso[] = []
    for (const [a, b] of porDia.get(dia)!) {
      const corte: [number, number, CategoriaFora | "dentro"][] = todoDia ? [[0, DIA_MIN, todoDia]] : faixas!
      for (const [fa, fb, cat] of corte) {
        const ini = Math.max(a, fa)
        const fim = Math.min(b, fb)
        if (fim <= ini) continue
        if (cat === "dentro") dentro += fim - ini
        else fora[cat] += fim - ini
        trechos.push({ inicio: arred(ini), fim: arred(fim), categoria: cat })
      }
    }
    for (const k of Object.keys(fora) as CategoriaFora[]) fora[k] = arred(fora[k])
    const foraTotal = Object.values(fora).reduce((s, v) => s + v, 0)
    dentro = arred(dentro)
    dias.push({
      data,
      diaSemana,
      nomeDia: NOMES_DIA[diaSemana],
      situacao,
      total: dentro + foraTotal,
      dentro,
      fora,
      foraTotal,
      considerado: !todoDia && foraTotal <= TOLERANCIA_DIARIA_MIN ? 0 : foraTotal,
      trechos: trechos.filter((t) => t.fim > t.inicio),
    })
  }
  return dias
}

export function resumirUso(dias: DiaUso[]): ResumoUso {
  const fora = foraVazio()
  let total = 0
  let dentro = 0
  let considerado = 0
  let diasComFora = 0
  let diasAcimaTolerancia = 0
  let ultimoDiaFora: string | null = null
  for (const d of dias) {
    total += d.total
    dentro += d.dentro
    considerado += d.considerado
    for (const k of Object.keys(fora) as CategoriaFora[]) fora[k] += d.fora[k]
    if (d.foraTotal > 0) {
      diasComFora++
      ultimoDiaFora = d.data
    }
    if (d.considerado > 0) diasAcimaTolerancia++
  }
  return {
    total,
    dentro,
    fora,
    foraTotal: Object.values(fora).reduce((s, v) => s + v, 0),
    considerado,
    diasComFora,
    diasAcimaTolerancia,
    ultimoDiaFora,
  }
}

/** Dias (AAAA-MM-DD) entre início e término, inclusive, cortados ao período. */
export function diasDoPeriodo(inicio: string, termino: string | null, de: string, ate: string): string[] {
  const a = inicio > de ? inicio : de
  const b = (termino ?? inicio) < ate ? (termino ?? inicio) : ate
  const out: string[] = []
  for (let t = Date.parse(`${a}T12:00:00Z`); t <= Date.parse(`${b}T12:00:00Z`); t += 86400000) {
    out.push(new Date(t).toISOString().slice(0, 10))
  }
  return out
}

/** Minutos → "2h05" / "45 min" / "—". */
export function textoMinutos(min: number): string {
  if (!min) return "—"
  if (min < 60) return `${min} min`
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`
}

/** Minutos do dia → "HH:MM". */
export function horaDoDia(min: number): string {
  const m = Math.min(Math.max(Math.round(min), 0), DIA_MIN)
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
}
