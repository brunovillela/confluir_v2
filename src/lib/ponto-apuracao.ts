/**
 * APURAÇÃO DAS HORAS DO MÊS PELAS BATIDAS (29/10/2026).
 *
 * Os totais do relatório do relógio podem estar errados; o que vale são as
 * batidas registradas. Para cada dia: trabalhado (pares entrada/saída) menos
 * a jornada prevista daquele dia da semana (o quadro HORÁRIO DE TRABALHO do
 * cartão). A diferença positiva vai para a faixa 1 (dia útil) ou para a
 * faixa 2 (sábado, domingo e feriado, conforme a entidade); a negativa soma
 * nas horas negativas, que descontam conforme a regra da entidade.
 *
 * Puro (sem banco): serve à importação e aos testes.
 */

export type RegrasApuracao = {
  faixa2Sabado: boolean
  faixa2Domingo: boolean
  faixa2Feriado: boolean
  /** faixa1: negativas saem só da faixa 1 (pode ficar negativa); faixa1_depois_faixa2: da 1 até zerar, o resto da 2. */
  negativas: "faixa1" | "faixa1_depois_faixa2"
  /** Diferença diária até estes minutos é desconsiderada (CLT art. 58, § 1º). */
  toleranciaDiariaMin: number
  /** Ocorrências que abonam o dia (sem jornada prevista e sem falta). */
  ocorrenciasAbonam: string[]
  /** Funcionário sem nenhuma batida no mês: só alertar ou lançar mesmo assim. */
  mesSemBatidas: "alertar" | "lancar"
}

export const REGRAS_PADRAO: RegrasApuracao = {
  faixa2Sabado: true,
  faixa2Domingo: true,
  faixa2Feriado: true,
  negativas: "faixa1",
  toleranciaDiariaMin: 10,
  ocorrenciasAbonam: ["Feriado", "Férias", "Atestado", "Folga", "Compensado", "Recesso", "DSR", "Abono", "Abonado", "Licença"],
  mesSemBatidas: "alertar",
}

/** O que a IA lê do cartão (sem interpretar). */
export type LeituraCartao = {
  nome: string | null
  cpf: string | null
  /** AAAA-MM-DD */
  periodoInicio: string | null
  periodoFim: string | null
  departamento: string | null
  /** Jornada prevista por dia da semana (0 = domingo … 6 = sábado): os horários previstos, HH:MM, ou só a carga do dia (um valor). */
  jornada: string[][]
  dias: { data: string; ocorrencia: string | null; marcacoes: string[] }[]
  /** Saldo do mês impresso pelo relatório (coluna BTOTAL dos totais), "+15:08" — só para conferência. */
  totalRelatorio: string | null
}

export type TipoDia = "util" | "sabado" | "domingo" | "feriado"

export type DiaApurado = {
  data: string
  tipo: TipoDia
  ocorrencia: string | null
  abonado: boolean
  previstoMin: number
  trabalhadoMin: number
  /** trabalhado − previsto, depois da tolerância. */
  saldoMin: number
  faixa: 1 | 2
  incompleto: boolean
}

export type Apuracao = {
  dias: DiaApurado[]
  positivosFaixa1Min: number
  positivosFaixa2Min: number
  negativosMin: number
  /** Resultado do mês, já com as negativas descontadas pela regra. */
  realizadasFaixa1Min: number
  realizadasFaixa2Min: number
  /** Saldo do relatório, em minutos (null se não lido). */
  totalRelatorioMin: number | null
  semBatidas: boolean
  incompletos: string[]
  alertas: string[]
}

const HORA = /^([01]?\d|2[0-3]):[0-5]\d$/

export function minutosDe(h: string): number {
  const [a, b] = h.split(":").map(Number)
  return a * 60 + b
}

/** "+15:08" / "-01:51" / "15:08" → minutos com sinal; null se não for horário. */
export function minutosComSinal(v: string | null | undefined): number | null {
  const m = /^\s*([+-])?\s*(\d{1,4}):([0-5]\d)\s*$/.exec(v ?? "")
  if (!m) return null
  const total = Number(m[2]) * 60 + Number(m[3])
  return m[1] === "-" ? -total : total
}

/** Minutos trabalhados nos pares entrada/saída (saída antes da entrada = virou a meia-noite). */
export function trabalhadoEm(marcacoes: string[]): number {
  let total = 0
  for (let i = 0; i + 1 < marcacoes.length; i += 2) {
    const ini = minutosDe(marcacoes[i])
    let fim = minutosDe(marcacoes[i + 1])
    if (fim < ini) fim += 24 * 60
    total += fim - ini
  }
  return total
}

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

export function apurarMes(leitura: LeituraCartao, regras: RegrasApuracao): Apuracao {
  const abonam = regras.ocorrenciasAbonam.map(sem).filter(Boolean)
  const abona = (oc: string | null) => Boolean(oc) && abonam.some((a) => sem(oc!).includes(a))
  // Jornada prevista do dia: os horários (pares) ou, quando o cartão traz só
  // a carga do dia (um valor, ex.: "05:14"), essa duração.
  const previstoDo = (dow: number) => {
    const j = (leitura.jornada[dow] ?? []).filter((h) => HORA.test(h))
    return j.length === 1 ? minutosDe(j[0]) : trabalhadoEm(j)
  }

  const dias: DiaApurado[] = []
  const incompletos: string[] = []
  for (const d of leitura.dias) {
    const dow = new Date(`${d.data}T12:00:00Z`).getUTCDay()
    const feriado = /feriad/i.test(d.ocorrencia ?? "")
    const tipo: TipoDia = feriado ? "feriado" : dow === 0 ? "domingo" : dow === 6 ? "sabado" : "util"
    // Batida repetida em seguida (toque duplo no relógio) conta uma vez só.
    const marc = d.marcacoes.filter((h, i, xs) => HORA.test(h) && h !== xs[i - 1])
    const incompleto = marc.length % 2 === 1
    if (incompleto) incompletos.push(d.data)
    const trabalhadoMin = trabalhadoEm(marc)
    // Dia abonado (feriado, férias, atestado…): não há jornada a cumprir.
    const abonado = abona(d.ocorrencia)
    const previstoMin = abonado || feriado ? 0 : previstoDo(dow)
    let saldo = trabalhadoMin - previstoMin
    // Tolerância só onde havia jornada: hora em dia de folga conta inteira.
    if (previstoMin > 0 && Math.abs(saldo) <= regras.toleranciaDiariaMin) saldo = 0
    const faixa2 =
      (tipo === "sabado" && regras.faixa2Sabado) ||
      (tipo === "domingo" && regras.faixa2Domingo) ||
      (tipo === "feriado" && regras.faixa2Feriado)
    dias.push({ data: d.data, tipo, ocorrencia: d.ocorrencia, abonado, previstoMin, trabalhadoMin, saldoMin: saldo, faixa: faixa2 ? 2 : 1, incompleto })
  }

  const positivosFaixa1Min = dias.filter((d) => d.saldoMin > 0 && d.faixa === 1).reduce((s, d) => s + d.saldoMin, 0)
  const positivosFaixa2Min = dias.filter((d) => d.saldoMin > 0 && d.faixa === 2).reduce((s, d) => s + d.saldoMin, 0)
  const negativosMin = dias.filter((d) => d.saldoMin < 0).reduce((s, d) => s - d.saldoMin, 0)

  let realizadasFaixa1Min = positivosFaixa1Min - negativosMin
  let realizadasFaixa2Min = positivosFaixa2Min
  if (regras.negativas === "faixa1_depois_faixa2" && realizadasFaixa1Min < 0) {
    realizadasFaixa2Min += realizadasFaixa1Min
    realizadasFaixa1Min = 0
  }

  const semBatidas = !leitura.dias.some((d) => d.marcacoes.some((h) => HORA.test(h)))
  const totalRelatorioMin = minutosComSinal(leitura.totalRelatorio)
  const alertas: string[] = []
  if (semBatidas) alertas.push("Nenhuma batida no mês (afastamento, férias ou isenção?).")
  if (incompletos.length) alertas.push(`${incompletos.length} dia(s) com marcação incompleta (número ímpar de batidas).`)
  if (!leitura.jornada.some((j) => j.length > 0) && !semBatidas) {
    alertas.push("Sem jornada prevista no cartão: todo o trabalhado conta como hora a mais.")
  }
  const apurado = positivosFaixa1Min + positivosFaixa2Min - negativosMin
  if (totalRelatorioMin !== null && Math.abs(totalRelatorioMin - apurado) > 1) {
    alertas.push(`O relatório soma ${formatarMin(totalRelatorioMin)}; pelas batidas, ${formatarMin(apurado)}.`)
  }

  return {
    dias,
    positivosFaixa1Min,
    positivosFaixa2Min,
    negativosMin,
    realizadasFaixa1Min,
    realizadasFaixa2Min,
    totalRelatorioMin,
    semBatidas,
    incompletos,
    alertas,
  }
}

/** −95 → "-1:35"; 908 → "+15:08". */
export function formatarMin(min: number): string {
  const sinal = min < 0 ? "-" : "+"
  const a = Math.abs(min)
  return `${sinal}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`
}
