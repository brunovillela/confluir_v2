/**
 * Painel de férias do Pessoal — contas PURAS sobre os períodos já lidos
 * (lib/db/ferias.ts). Fora do `server-only` para ser testável isolado.
 *
 * Convenção de datas: o `termino` do gozo é o ÚLTIMO dia de férias (o dia de
 * início conta — ver lib/periodo-dias.ts).
 */

import { somarDiasISO } from "@/lib/periodo-dias"

/** Alerta de prazo: mesmo corte do painel inicial do Pessoal. */
export const DIAS_ALERTA_CONCESSIVO = 120

type GozoBase = {
  id: string
  inicio: string | null
  termino: string | null
  dias: number | null
  autorizado: boolean | null
  abono_solicitado: boolean | null
  created_at: string | null
}

type PeriodoBase = {
  id: string
  trabalhador_id: string | null
  aquisitivo_inicio: string | null
  aquisitivo_termino: string | null
  concessivo_inicio: string | null
  concessivo_termino: string | null
  dias_disponiveis: number | null
  abono_pecuniario: boolean | null
  finalizado: boolean | null
  gozos: GozoBase[]
}

function saldoDo(p: PeriodoBase): number {
  const direito = p.dias_disponiveis ?? 0
  const abono = p.abono_pecuniario === true ? Math.floor(direito / 3) : 0
  const gozados = p.gozos.reduce((s, g) => s + (g.dias ?? 0), 0)
  return direito - abono - gozados
}

function diasEntre(deISO: string, ateISO: string): number {
  return Math.round(
    (new Date(`${ateISO}T00:00:00Z`).getTime() - new Date(`${deISO}T00:00:00Z`).getTime()) /
      86_400_000
  )
}

// ── Situação de cada funcionário ────────────────────────────────────────────

export type ChaveSituacao =
  | "em_ferias"
  | "vencido"
  | "vencendo"
  | "marcadas"
  | "sem_periodo"
  | "em_dia"

/** Ordem de gravidade: o que pede ação primeiro. */
export const ORDEM_SITUACAO: ChaveSituacao[] = [
  "vencido",
  "vencendo",
  "em_ferias",
  "marcadas",
  "sem_periodo",
  "em_dia",
]

export const ROTULO_SITUACAO: Record<ChaveSituacao, string> = {
  em_ferias: "Em férias",
  vencido: "Período vencido",
  vencendo: "Prazo vencendo",
  marcadas: "Férias marcadas",
  sem_periodo: "Sem período",
  em_dia: "Em dia",
}

export type SituacaoFuncionario = {
  chave: ChaveSituacao
  /** Complemento curto: "até 10/10", "vence em 32 dias"… (datas em ISO). */
  detalhe: { tipo: "ate" | "desde" | "em_dias" | "venceu_em"; valor: string | number } | null
  /** Saldo dos períodos em aberto (com os gozos já marcados descontados). */
  saldo: number
  periodosAbertos: number
  /** Próximo gozo a começar (autorizado ou não). */
  proximoGozo: { inicio: string; termino: string | null; autorizado: boolean } | null
  /** Concessivo em aberto que termina primeiro e ainda tem saldo. */
  prazo: string | null
  /** Sugestão de início do próximo período aquisitivo. */
  proximoAquisitivo: string | null
}

export function situacaoDoFuncionario(
  periodos: PeriodoBase[],
  hoje: string,
  admissao: string | null
): SituacaoFuncionario {
  const abertos = periodos.filter((p) => p.finalizado !== true)
  const gozos = periodos.flatMap((p) => p.gozos)

  const atual = gozos.find(
    (g) => g.autorizado === true && g.inicio && g.termino && g.inicio <= hoje && hoje <= g.termino
  )
  const proximo =
    gozos
      .filter((g) => g.inicio && g.inicio > hoje)
      .sort((a, b) => (a.inicio! < b.inicio! ? -1 : 1))[0] ?? null

  const comSaldo = abertos
    .filter((p) => saldoDo(p) > 0 && p.concessivo_termino)
    .sort((a, b) => (a.concessivo_termino! < b.concessivo_termino! ? -1 : 1))
  const prazo = comSaldo[0]?.concessivo_termino ?? null
  const saldo = abertos.reduce((s, p) => s + Math.max(0, saldoDo(p)), 0)

  const ultimoTermino = periodos
    .map((p) => p.aquisitivo_termino)
    .filter((d): d is string => Boolean(d))
    .sort()
    .at(-1)
  const proximoAquisitivo = ultimoTermino ? somarDiasISO(ultimoTermino, 1) : admissao

  const base = {
    saldo,
    periodosAbertos: abertos.length,
    proximoGozo: proximo
      ? { inicio: proximo.inicio!, termino: proximo.termino, autorizado: proximo.autorizado === true }
      : null,
    prazo,
    proximoAquisitivo,
  }

  if (prazo && prazo < hoje) {
    return { ...base, chave: "vencido", detalhe: { tipo: "venceu_em", valor: prazo } }
  }
  if (atual) {
    return { ...base, chave: "em_ferias", detalhe: { tipo: "ate", valor: atual.termino! } }
  }
  if (prazo && diasEntre(hoje, prazo) <= DIAS_ALERTA_CONCESSIVO) {
    return { ...base, chave: "vencendo", detalhe: { tipo: "em_dias", valor: diasEntre(hoje, prazo) } }
  }
  if (proximo) {
    return { ...base, chave: "marcadas", detalhe: { tipo: "desde", valor: proximo.inicio! } }
  }
  if (periodos.length === 0) return { ...base, chave: "sem_periodo", detalhe: null }
  return { ...base, chave: "em_dia", detalhe: null }
}

// ── Distribuição por mês ────────────────────────────────────────────────────

export type MesDistribuicao = {
  /** 0 = janeiro. */
  mes: number
  autorizados: number
  aguardando: number
  /** Pessoas com pelo menos um dia de férias no mês. */
  pessoas: number
}

/**
 * Dias de férias por mês do ano: cada gozo é repartido entre os meses que
 * atravessa (um gozo de 25/06 a 14/07 conta 6 dias em junho e 14 em julho).
 */
export function distribuicaoPorMes(
  periodos: PeriodoBase[],
  ano: number
): MesDistribuicao[] {
  const meses: MesDistribuicao[] = Array.from({ length: 12 }, (_, mes) => ({
    mes,
    autorizados: 0,
    aguardando: 0,
    pessoas: 0,
  }))
  const pessoasPorMes = Array.from({ length: 12 }, () => new Set<string>())
  const inicioAno = `${ano}-01-01`
  const fimAno = `${ano}-12-31`

  for (const p of periodos) {
    for (const g of p.gozos) {
      if (!g.inicio || !g.termino || g.termino < g.inicio) continue
      if (g.termino < inicioAno || g.inicio > fimAno) continue
      let dia = g.inicio < inicioAno ? inicioAno : g.inicio
      const ultimo = g.termino > fimAno ? fimAno : g.termino
      while (dia <= ultimo) {
        const mes = Number(dia.slice(5, 7)) - 1
        if (g.autorizado === true) meses[mes].autorizados++
        else meses[mes].aguardando++
        pessoasPorMes[mes].add(p.trabalhador_id ?? p.id)
        dia = somarDiasISO(dia, 1)
      }
    }
  }
  pessoasPorMes.forEach((s, i) => (meses[i].pessoas = s.size))
  return meses
}

/** Anos com gozo registrado, mais o atual — opções do seletor do gráfico. */
export function anosComGozo(periodos: PeriodoBase[], anoAtual: number): number[] {
  const anos = new Set<number>([anoAtual, anoAtual + 1])
  for (const p of periodos) {
    for (const g of p.gozos) {
      if (g.inicio) anos.add(Number(g.inicio.slice(0, 4)))
    }
  }
  return [...anos].sort((a, b) => b - a)
}
