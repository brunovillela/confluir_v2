import "server-only"

import { lerEmLotes } from "@/lib/db/comum"
import { createAdminClient, createServiceClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * CAMADA ANALÍTICA (onda 3, I1): leitura dos fatos mensais materializados em
 * supabase/analitica.sql. Cada leitura passa o tenant da requisição à função
 * analitica_*(p_emp, p_meses) — o recorte por tenant é feito no banco, as
 * views nunca são lidas inteiras. Sem o SQL rodado, `disponivel` é false e a
 * tela explica o que falta em vez de quebrar.
 */

export type FiliacaoMensal = { mes: string; entradas: number; saidas: number; ativosFimMes: number }
export type ArrecadacaoMensal = { mes: string; tipo: string; fonteId: string | null; valor: number; lancamentos: number; pagantes: number }
export type DespesaMensal = { mes: string; tipo: string; centroCustoId: string | null; departamentoId: string | null; valor: number; ordens: number }
export type FrotaMensal = {
  mes: string
  veiculoId: string
  abastecimentoValor: number
  abastecimentoLitros: number
  kmRodados: number
  abastecimentos: number
  manutencaoValor: number
  manutencoes: number
  multasValor: number
  multas: number
  aluguelValor: number
}
export type Atualizacao = { fato: string; atualizadoEm: string; duracaoMs: number | null }

export type Serie<T> = { disponivel: boolean; linhas: T[] }

const AVISO_SQL = "Camada analítica ainda não configurada — rode supabase/analitica.sql."

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

function semEsquema(error: { code?: string; message?: string } | null): boolean {
  return !!error && (["PGRST202", "42883", "42P01"].includes(error.code ?? "") || /does not exist|Could not find the function/i.test(error.message ?? ""))
}

/**
 * `chave` = colunas do índice único do fato dentro do tenant: a ordem das
 * funções (mes, tipo) não desempata, e sem ordem única os lotes repetem ou
 * pulam linhas.
 */
async function ler<T>(funcao: string, meses: number, chave: string[], mapear: (r: Record<string, unknown>) => T): Promise<Serie<T>> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  // PostgREST corta em 1.000 linhas também no rpc: as funções saem em ordem
  // de mês crescente, então sem paginar os meses mais recentes sumiam (a
  // despesa de 12 meses tem ~1.300 linhas).
  let linhas: Record<string, unknown>[]
  try {
    linhas = await lerEmLotes<Record<string, unknown>>((de, ate) => {
      let q = admin.rpc(funcao, { p_emp: emp, p_meses: meses })
      for (const coluna of chave) q = q.order(coluna)
      return q.range(de, ate)
    })
  } catch (e) {
    if (semEsquema(e as { code?: string; message?: string })) return { disponivel: false, linhas: [] }
    throw new Error(`Falha na camada analítica (${funcao}): ${(e as Error).message}`)
  }
  return { disponivel: true, linhas: linhas.map(mapear) }
}

export const avisoAnalitica = AVISO_SQL

export function serieFiliacao(meses = 12): Promise<Serie<FiliacaoMensal>> {
  return ler("analitica_filiacao", meses, ["mes"], (r) => ({
    mes: String(r.mes).slice(0, 10),
    entradas: num(r.entradas),
    saidas: num(r.saidas),
    ativosFimMes: num(r.ativos_fim_mes),
  }))
}

export function serieArrecadacao(meses = 12): Promise<Serie<ArrecadacaoMensal>> {
  return ler("analitica_arrecadacao", meses, ["mes", "tipo", "fonte_chave"], (r) => ({
    mes: String(r.mes).slice(0, 10),
    tipo: String(r.tipo ?? ""),
    fonteId: r.fonte_id ? String(r.fonte_id) : null,
    valor: num(r.valor),
    lancamentos: num(r.lancamentos),
    pagantes: num(r.pagantes),
  }))
}

export function serieDespesa(meses = 12): Promise<Serie<DespesaMensal>> {
  return ler("analitica_despesa", meses, ["mes", "tipo", "centro_chave", "departamento_chave"], (r) => ({
    mes: String(r.mes).slice(0, 10),
    tipo: String(r.tipo ?? ""),
    centroCustoId: r.centro_custo_despesa_id ? String(r.centro_custo_despesa_id) : null,
    departamentoId: r.departamento_id ? String(r.departamento_id) : null,
    valor: num(r.valor),
    ordens: num(r.ordens),
  }))
}

export function serieFrota(meses = 12): Promise<Serie<FrotaMensal>> {
  return ler("analitica_frota", meses, ["mes", "veiculo_id"], (r) => ({
    mes: String(r.mes).slice(0, 10),
    veiculoId: String(r.veiculo_id),
    abastecimentoValor: num(r.abastecimento_valor),
    abastecimentoLitros: num(r.abastecimento_litros),
    kmRodados: num(r.km_rodados),
    abastecimentos: num(r.abastecimentos),
    manutencaoValor: num(r.manutencao_valor),
    manutencoes: num(r.manutencoes),
    multasValor: num(r.multas_valor),
    multas: num(r.multas),
    aluguelValor: num(r.aluguel_valor),
  }))
}

/** Quando cada fato foi atualizado pela última vez (null = SQL não rodou). */
export async function situacaoAnalitica(): Promise<Atualizacao[] | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin.rpc("analitica_situacao")
  if (error) {
    if (semEsquema(error)) return null
    throw new Error(`Falha ao ler a situação da camada analítica: ${error.message}`)
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    fato: String(r.fato),
    atualizadoEm: String(r.atualizado_em),
    duracaoMs: r.duracao_ms == null ? null : num(r.duracao_ms),
  }))
}

/**
 * Recalcula os quatro fatos (todas as entidades de uma vez — as views não
 * separam tenant no refresh). Usada pelo cron e pelo botão "Atualizar agora".
 */
export async function atualizarAnalitica(): Promise<{ ok: boolean; duracoes?: Record<string, number>; erro?: string }> {
  const svc = createServiceClient()
  const { data, error } = await svc.rpc("analitica_atualizar")
  if (error) return { ok: false, erro: semEsquema(error) ? AVISO_SQL : error.message }
  return { ok: true, duracoes: (data ?? {}) as Record<string, number> }
}
