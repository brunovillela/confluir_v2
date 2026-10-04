import "server-only"

import { serieArrecadacao } from "@/lib/db/analitica"
import { hojeSP } from "@/lib/db/comum"
import { estatisticasFonteDetalhe } from "@/lib/db/fontes"

/**
 * ARRECADAÇÃO POR EMPREGADOR/FONTE (onda 3, I5): a série mensal da fonte
 * (valor por tipo e pagantes), o último mês com remessa contra o anterior,
 * pagantes × filiados ativos e se há atraso de remessa. Lê a camada
 * analítica recortada pela fonte.
 */

export type SerieNomeada = { nome: string; valores: number[]; outros?: boolean }
export type ArrecadacaoEmpregador = {
  disponivel: boolean
  meses: string[]
  valorPorTipo: SerieNomeada[]
  pagantes: number[]
  ultimo: { mes: string; valor: number; pagantes: number } | null
  anterior: { mes: string; valor: number; pagantes: number } | null
  filiadosAtivos: number
  /** Meses fechados sem remessa desta fonte (0 = em dia). */
  mesesSemRemessa: number
}

export async function arrecadacaoDoEmpregador(empresaId: string, meses = 24): Promise<ArrecadacaoEmpregador> {
  const [serie, stats] = await Promise.all([serieArrecadacao(meses), estatisticasFonteDetalhe(empresaId).catch(() => null)])
  const hoje = hojeSP()
  const [a, m] = hoje.split("-").map(Number)
  const eixo = Array.from({ length: meses }, (_, i) => new Date(Date.UTC(a, m - 1 - (meses - 1 - i), 1)).toISOString().slice(0, 10))
  const idx = new Map(eixo.map((x, i) => [x, i]))
  const porTipo = new Map<string, number[]>()
  const pagantes = eixo.map(() => 0)
  const porMes = new Map<string, { valor: number; pagantes: number }>()
  for (const l of serie.linhas) {
    if (l.fonteId !== empresaId) continue
    const t = porMes.get(l.mes) ?? { valor: 0, pagantes: 0 }
    t.valor += l.valor
    t.pagantes += l.pagantes
    porMes.set(l.mes, t)
    const i = idx.get(l.mes)
    if (i === undefined) continue
    const s = porTipo.get(l.tipo) ?? eixo.map(() => 0)
    s[i] += l.valor
    porTipo.set(l.tipo, s)
    pagantes[i] += l.pagantes
  }
  const mesesComValor = [...porMes.keys()].sort()
  const ultimoMes = mesesComValor.at(-1) ?? null
  const anteriorMes = mesesComValor.at(-2) ?? null
  const mesEsperado = new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 10)
  const diff = ultimoMes ? (Number(mesEsperado.slice(0, 4)) - Number(ultimoMes.slice(0, 4))) * 12 + Number(mesEsperado.slice(5, 7)) - Number(ultimoMes.slice(5, 7)) : 99
  return {
    disponivel: serie.disponivel,
    meses: eixo,
    valorPorTipo: [...porTipo.entries()].sort((x, y) => y[1].reduce((s, v) => s + v, 0) - x[1].reduce((s, v) => s + v, 0)).map(([nome, valores]) => ({ nome, valores })),
    pagantes,
    ultimo: ultimoMes ? { mes: ultimoMes, ...porMes.get(ultimoMes)! } : null,
    anterior: anteriorMes ? { mes: anteriorMes, ...porMes.get(anteriorMes)! } : null,
    filiadosAtivos: stats?.filiadosAtivos ?? 0,
    mesesSemRemessa: serie.disponivel ? Math.max(0, diff) : 0,
  }
}
