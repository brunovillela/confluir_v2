/**
 * Calendário da Agenda — regras PURAS (sem banco; o componente cliente usa).
 *
 * Tudo em dias "AAAA-MM-DD" e minutos do dia no horário de Brasília. A grade
 * começa no domingo. Vale como no Google Agenda: compromisso de dia todo ou
 * que atravessa dias vira FAIXA (no topo da semana); o resto ocupa as horas.
 */
import { formatarData, formatarDataHora } from "@/lib/formato"

const FUSO = "America/Sao_Paulo"

export const VISOES_AGENDA = ["lista", "mes", "semana", "dia"] as const
export type VisaoAgenda = (typeof VISOES_AGENDA)[number]
export type VisaoCalendario = Exclude<VisaoAgenda, "lista">

export const COOKIE_VISAO_AGENDA = "agenda_visao"

export function ehVisaoAgenda(v: unknown): v is VisaoAgenda {
  return (VISOES_AGENDA as readonly unknown[]).includes(v)
}

export function ehDia(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T12:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v
}

// ── Datas ───────────────────────────────────────────────────────────────────

export function somarDias(dia: string, n: number): string {
  const d = new Date(`${dia}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Soma meses sem pular mês: 31/01 + 1 mês = 28 ou 29/02. */
export function somarMeses(dia: string, n: number): string {
  const [ano, mes, d] = dia.split("-").map(Number)
  const alvo = new Date(Date.UTC(ano, mes - 1 + n, 1, 12))
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0, 12)).getUTCDate()
  alvo.setUTCDate(Math.min(d, ultimo))
  return alvo.toISOString().slice(0, 10)
}

/** 0 = domingo. */
export function diaDaSemana(dia: string): number {
  return new Date(`${dia}T12:00:00Z`).getUTCDay()
}

function sequencia(de: string, quantos: number): string[] {
  return Array.from({ length: quantos }, (_, i) => somarDias(de, i))
}

/** Os dias que a visão mostra. Mês: semanas inteiras, de domingo a sábado. */
export function diasDaVisao(visao: VisaoCalendario, dia: string): string[] {
  if (visao === "dia") return [dia]
  if (visao === "semana") return sequencia(somarDias(dia, -diaDaSemana(dia)), 7)
  const primeiro = `${dia.slice(0, 7)}-01`
  const ultimo = somarDias(somarMeses(primeiro, 1), -1)
  const de = somarDias(primeiro, -diaDaSemana(primeiro))
  const ate = somarDias(ultimo, 6 - diaDaSemana(ultimo))
  const quantos = Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000) + 1
  return sequencia(de, quantos)
}

/** O mesmo dia, no período anterior (-1) ou seguinte (+1) da visão. */
export function navegar(visao: VisaoCalendario, dia: string, passo: -1 | 1): string {
  if (visao === "mes") return somarMeses(dia, passo)
  return somarDias(dia, visao === "semana" ? 7 * passo : passo)
}

/** Limites da consulta ao banco: [início do 1º dia, início do dia seguinte ao último). */
export function limitesDaConsulta(dias: string[]): { de: string; ate: string } {
  return {
    de: new Date(`${dias[0]}T00:00:00-03:00`).toISOString(),
    ate: new Date(`${somarDias(dias[dias.length - 1], 1)}T00:00:00-03:00`).toISOString(),
  }
}

function fmt(dia: string, opcoes: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", ...opcoes }).format(new Date(`${dia}T12:00:00Z`))
}

/** "novembro de 2026", "1 a 7 de novembro de 2026", "terça-feira, 3 de novembro de 2026". */
export function tituloDaVisao(visao: VisaoCalendario, dia: string): string {
  if (visao === "mes") return fmt(dia, { month: "long", year: "numeric" })
  if (visao === "dia") return fmt(dia, { weekday: "long", day: "numeric", month: "long", year: "numeric" })
  const dias = diasDaVisao("semana", dia)
  const a = dias[0]
  const b = dias[6]
  const fimTexto = fmt(b, { day: "numeric", month: "long", year: "numeric" })
  if (a.slice(0, 7) === b.slice(0, 7)) return `${Number(a.slice(8))} a ${fimTexto}`
  if (a.slice(0, 4) === b.slice(0, 4)) return `${fmt(a, { day: "numeric", month: "long" })} a ${fimTexto}`
  return `${fmt(a, { day: "numeric", month: "long", year: "numeric" })} a ${fimTexto}`
}

export function rotuloDia(dia: string): string {
  return fmt(dia, { weekday: "long", day: "numeric", month: "long" })
}

export function diaSP(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(new Date(iso))
}

export function minutosSP(iso: string | Date): number {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: FUSO,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso))
  const v = (t: string) => Number(partes.find((p) => p.type === t)?.value ?? 0)
  return v("hour") * 60 + v("minute")
}

export function horaDeMinutos(min: number): string {
  const m = Math.max(0, Math.min(1439, min))
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
}

// ── Compromissos ────────────────────────────────────────────────────────────

export type CompromissoBase = {
  id: string
  inicio: string | null
  termino: string | null
  diaTodo: boolean
}

/** Primeiro e último dia ocupados. Término à meia-noite não ocupa o dia novo. */
export function periodoEmDias(e: CompromissoBase): { diaIni: string; diaFim: string } | null {
  if (!e.inicio) return null
  const diaIni = diaSP(e.inicio)
  if (!e.termino) return { diaIni, diaFim: diaIni }
  let diaFim = diaSP(e.termino)
  if (!e.diaTodo && diaFim > diaIni && minutosSP(e.termino) === 0) diaFim = somarDias(diaFim, -1)
  // Dado migrado do Bubble pode ter término antes do início.
  return { diaIni, diaFim: diaFim < diaIni ? diaIni : diaFim }
}

/** Faixa: dia todo ou atravessa dias (vai para o topo, não para as horas). */
export function ehFaixa(e: CompromissoBase): boolean {
  const p = periodoEmDias(e)
  return Boolean(p) && (e.diaTodo || p!.diaFim > p!.diaIni)
}

/** "03/11/2026, 09:00 – 10:00", "03/11/2026 a 05/11/2026 (dia todo)"… */
export function rotuloPeriodo(e: Omit<CompromissoBase, "id">): string {
  const p = periodoEmDias({ ...e, id: "" })
  if (!p || !e.inicio) return "—"
  if (e.diaTodo) {
    const fim = p.diaFim > p.diaIni && e.termino ? ` a ${formatarData(e.termino)}` : ""
    return `${formatarData(e.inicio)}${fim} (dia todo)`
  }
  const ini = formatarDataHora(e.inicio)
  if (!e.termino || new Date(e.termino) <= new Date(e.inicio)) return ini
  if (diaSP(e.termino) === p.diaIni) return `${ini} – ${horaDeMinutos(minutosSP(e.termino))}`
  return `${ini} – ${formatarDataHora(e.termino)}`
}

export type Barra<T> = {
  evento: T
  /** Coluna inicial no trecho (0 = primeira) e quantas ocupa. */
  coluna: number
  span: number
  /** Faixa vertical (0 = primeira). */
  linha: number
  /** Começou antes ou segue depois do trecho visível. */
  continuaAntes: boolean
  continuaDepois: boolean
}

/**
 * Empilha os compromissos de um trecho (semana ou dia) em linhas sem colisão:
 * os de vários dias primeiro, depois os de dia todo, depois por hora. O que
 * não cabe em `maxLinhas` entra na contagem de `ocultos` ("+N mais") de cada dia.
 */
export function distribuirNaSemana<T extends CompromissoBase>(
  eventos: T[],
  dias: string[],
  maxLinhas = Infinity
): { barras: Barra<T>[]; ocultos: number[] } {
  const primeiro = dias[0]
  const ultimo = dias[dias.length - 1]
  const candidatos = eventos
    .flatMap((evento) => {
      const p = periodoEmDias(evento)
      if (!p || p.diaFim < primeiro || p.diaIni > ultimo) return []
      const de = p.diaIni < primeiro ? primeiro : p.diaIni
      const ate = p.diaFim > ultimo ? ultimo : p.diaFim
      const coluna = dias.indexOf(de)
      return [{ evento, ...p, coluna, span: dias.indexOf(ate) - coluna + 1 }]
    })
    .sort((a, b) => {
      const variosA = a.diaFim > a.diaIni ? 1 : 0
      const variosB = b.diaFim > b.diaIni ? 1 : 0
      if (variosA !== variosB) return variosB - variosA
      if (a.coluna !== b.coluna) return a.coluna - b.coluna
      if (a.span !== b.span) return b.span - a.span
      if (a.evento.diaTodo !== b.evento.diaTodo) return a.evento.diaTodo ? -1 : 1
      return (a.evento.inicio ?? "").localeCompare(b.evento.inicio ?? "")
    })

  const ocupadas: boolean[][] = []
  const barras: Barra<T>[] = []
  const ocultos = dias.map(() => 0)
  for (const c of candidatos) {
    let linha = 0
    for (;;) {
      const faixa = (ocupadas[linha] ??= dias.map(() => false))
      let livre = true
      for (let i = c.coluna; i < c.coluna + c.span; i++) if (faixa[i]) livre = false
      if (livre) break
      linha++
    }
    if (linha >= maxLinhas) {
      for (let i = c.coluna; i < c.coluna + c.span; i++) ocultos[i]++
      continue
    }
    for (let i = c.coluna; i < c.coluna + c.span; i++) ocupadas[linha][i] = true
    barras.push({
      evento: c.evento,
      coluna: c.coluna,
      span: c.span,
      linha,
      continuaAntes: c.diaIni < primeiro,
      continuaDepois: c.diaFim > ultimo,
    })
  }
  return { barras, ocultos }
}

export type BlocoHorario<T> = {
  evento: T
  inicioMin: number
  fimMin: number
  /** Posição lado a lado quando há sobreposição. */
  coluna: number
  colunas: number
}

/** Duração mínima na tela, para o bloco ter altura para o título. */
const MINUTOS_MINIMOS = 30

/** Blocos de um dia na grade de horas; sobrepostos dividem a largura. */
export function distribuirNoDia<T extends CompromissoBase>(eventos: T[], dia: string): BlocoHorario<T>[] {
  const blocos: BlocoHorario<T>[] = eventos
    .filter((e) => !ehFaixa(e) && periodoEmDias(e)?.diaIni === dia)
    .map((evento) => {
      const inicioMin = minutosSP(evento.inicio!)
      const fimReal = evento.termino ? minutosSP(evento.termino) : inicioMin + 60
      // Término à meia-noite (0) ou anterior ao início: vale a hora padrão, salvo
      // a meia-noite, que fecha o dia.
      const fim = fimReal === 0 && evento.termino ? 1440 : fimReal <= inicioMin ? inicioMin + 60 : fimReal
      return {
        evento,
        inicioMin,
        fimMin: Math.min(1440, Math.max(fim, inicioMin + MINUTOS_MINIMOS)),
        coluna: 0,
        colunas: 1,
      }
    })
    .sort((a, b) => a.inicioMin - b.inicioMin || b.fimMin - a.fimMin)

  let grupo: BlocoHorario<T>[] = []
  let fimDoGrupo = -1
  const finsPorColuna: number[] = []
  const fechar = () => {
    const colunas = grupo.reduce((m, b) => Math.max(m, b.coluna + 1), 1)
    for (const b of grupo) b.colunas = colunas
    grupo = []
    finsPorColuna.length = 0
    fimDoGrupo = -1
  }
  for (const b of blocos) {
    if (b.inicioMin >= fimDoGrupo) fechar()
    let coluna = finsPorColuna.findIndex((fim) => fim <= b.inicioMin)
    if (coluna === -1) coluna = finsPorColuna.length
    finsPorColuna[coluna] = b.fimMin
    b.coluna = coluna
    grupo.push(b)
    fimDoGrupo = Math.max(fimDoGrupo, b.fimMin)
  }
  fechar()
  return blocos
}

// ── Arrastar ────────────────────────────────────────────────────────────────

/** Passo do encaixe ao arrastar na grade de horas. */
export const PASSO_ARRASTO_MIN = 15

export function diferencaDias(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000)
}

/** O mesmo momento, `n` dias depois (Brasília não tem horário de verão desde 2019). */
export function deslocarDias(iso: string, n: number): string {
  return new Date(new Date(iso).getTime() + n * 86_400_000).toISOString()
}

export function inicioNoHorario(dia: string, minuto: number): string {
  return new Date(`${dia}T${horaDeMinutos(minuto)}:00-03:00`).toISOString()
}

/** Duração para a grade de horas; sem término (ou término inválido), 1 hora. */
export function duracaoEmMinutos(e: Pick<CompromissoBase, "inicio" | "termino">): number {
  if (!e.inicio || !e.termino) return 60
  const min = (new Date(e.termino).getTime() - new Date(e.inicio).getTime()) / 60_000
  return min > 0 ? min : 60
}

/** Encaixa no passo e mantém o compromisso inteiro dentro do dia. */
export function encaixarMinuto(bruto: number, duracao: number): number {
  const encaixado = Math.round(bruto / PASSO_ARRASTO_MIN) * PASSO_ARRASTO_MIN
  const ultimo = Math.floor(Math.max(0, 1440 - duracao) / PASSO_ARRASTO_MIN) * PASSO_ARRASTO_MIN
  return Math.max(0, Math.min(ultimo, encaixado))
}

/** Novo início e término, com a mesma duração. Vale na tela e no servidor. */
export function aplicarMovimento(
  e: Pick<CompromissoBase, "inicio" | "termino">,
  novoInicio: string
): { inicio: string; termino: string | null } {
  const inicio = new Date(novoInicio).toISOString()
  if (!e.inicio || !e.termino) return { inicio, termino: e.termino }
  const delta = new Date(inicio).getTime() - new Date(e.inicio).getTime()
  return { inicio, termino: new Date(new Date(e.termino).getTime() + delta).toISOString() }
}

/** Os dias ocupados depois de soltar, para destacar o destino. */
export function diasDoDestino(
  e: CompromissoBase,
  diaPego: string,
  diaAlvo: string
): { de: string; ate: string } | null {
  const p = periodoEmDias(e)
  if (!p) return null
  const n = diferencaDias(diaPego, diaAlvo)
  return { de: somarDias(p.diaIni, n), ate: somarDias(p.diaFim, n) }
}

// ── Criação rápida ──────────────────────────────────────────────────────────

export type VagaNaAgenda = { dia: string; minuto?: number; diaTodo?: boolean }

/** Valores iniciais: 1 hora a partir do clique (no mês, 09:00). */
export function camposDaVaga(v: VagaNaAgenda): { inicio: string; termino: string; data: string; diaTodo: boolean } {
  const ini = v.minuto ?? 540
  const fim = ini + 60
  const diaFim = fim >= 1440 ? somarDias(v.dia, 1) : v.dia
  return {
    inicio: `${v.dia}T${horaDeMinutos(ini)}`,
    termino: `${diaFim}T${horaDeMinutos(fim % 1440)}`,
    data: v.dia,
    diaTodo: v.diaTodo === true,
  }
}
