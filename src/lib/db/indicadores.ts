import "server-only"

import type { SessaoPainel } from "@/lib/auth"
import { serieArrecadacao, serieDespesa, serieFiliacao, situacaoAnalitica, type Atualizacao } from "@/lib/db/analitica"
import { listarContasCaixa } from "@/lib/db/caixa"
import { hojeSP, lerEmLotes } from "@/lib/db/comum"
import { somarDias } from "@/lib/db/ferias"
import { filiadosAtivos } from "@/lib/db/filiacao-ativos"
import { relatorioInadimplencia } from "@/lib/db/filiacao-inadimplencia"
import { SITUACOES_ABERTAS } from "@/lib/db/financeiro"
import { pendenciasDoUsuario, totalPendencias } from "@/lib/db/pendencias"
import { gruposDaPessoa, vencimentosDoTenant } from "@/lib/db/vencimentos"
import { podeAcessar } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * PAINEL EXECUTIVO (onda 3, I2): os números que a gestão e a diretoria
 * precisam ver antes de decidir — filiação, arrecadação, caixa, despesa e o
 * que está parado ou vencido. As séries mensais vêm da camada analítica
 * (lib/db/analitica.ts); os valores "de hoje" (ativos, caixa, a pagar) são
 * lidos na hora. Cada bloco só entra para quem tem a permissão da área.
 */

export type Ponto = { mes: string; valor: number }
export type SerieNomeada = { nome: string; valores: number[]; outros?: boolean }

export type PainelExecutivo = {
  analiticaDisponivel: boolean
  atualizacoes: Atualizacao[] | null
  meses: string[]
  filiacao: null | {
    ativosHoje: number
    ativosHa12Meses: number | null
    ativosSerie: number[]
    entradas: number[]
    saidas: number[]
    inadimplentes: { quantidade: number; configurado: boolean } | null
  }
  arrecadacao: null | {
    ultimoMes: string | null
    valorUltimoMes: number
    valorMesAnterior: number | null
    pagantesUltimoMes: number
    porTipo: SerieNomeada[]
  }
  financeiro: null | {
    saldoCaixa: number | null
    aPagar30d: { quantidade: number; valor: number }
    vencidas: { quantidade: number; valor: number }
    despesaPorTipo: SerieNomeada[]
    despesaUltimoMes: number
  }
  vencidos: { titulo: string; quantidade: number; href: string }[]
  pendencias: number
}

function ultimosMeses(n: number): string[] {
  const hoje = hojeSP()
  const [a, m] = hoje.split("-").map(Number)
  const lista: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1))
    lista.push(d.toISOString().slice(0, 10))
  }
  return lista
}

/** Top N séries por soma; o resto some em "Outros" (cinza), para o gráfico não cair na 9ª cor. */
function topMaisOutros(porNome: Map<string, number[]>, n: number): SerieNomeada[] {
  const ordenadas = [...porNome.entries()].sort((a, b) => b[1].reduce((s, v) => s + v, 0) - a[1].reduce((s, v) => s + v, 0))
  const top: SerieNomeada[] = ordenadas.slice(0, n).map(([nome, valores]) => ({ nome, valores }))
  const resto = ordenadas.slice(n)
  if (resto.length) {
    const tamanho = resto[0][1].length
    const outros = Array.from({ length: tamanho }, (_, i) => resto.reduce((s, [, v]) => s + (v[i] ?? 0), 0))
    top.push({ nome: `Outros (${resto.length})`, valores: outros, outros: true })
  }
  return top
}

export async function painelExecutivo(sessao: SessaoPainel): Promise<PainelExecutivo> {
  const p = sessao.permissoes
  const emp = await tenantAtual()
  const meses = ultimosMeses(12)
  const idx = new Map(meses.map((m, i) => [m, i]))
  const veFiliacao = podeAcessar(p, "filiacao_gestao", ["filiacao_filiados", "filiacao_receitas", "configuracoes"])
  const veFinanceiro = podeAcessar(p, "financeiro_leitura", ["financeiro_pagamento", "financeiro_caixa", "configuracoes"])

  const [atualizacoes, fil, arr, desp, pend, vencGrupos] = await Promise.all([
    situacaoAnalitica().catch(() => null),
    veFiliacao ? serieFiliacao(13) : Promise.resolve({ disponivel: false, linhas: [] }),
    veFiliacao ? serieArrecadacao(13) : Promise.resolve({ disponivel: false, linhas: [] }),
    veFinanceiro ? serieDespesa(12) : Promise.resolve({ disponivel: false, linhas: [] }),
    pendenciasDoUsuario(sessao).catch(() => []),
    vencimentosDoTenant(emp).catch(() => []),
  ])
  const analiticaDisponivel = atualizacoes !== null

  // ── Filiação ──────────────────────────────────────────────────────────────
  let filiacao: PainelExecutivo["filiacao"] = null
  if (veFiliacao) {
    const ativosHoje = (await filiadosAtivos().catch(() => new Map())).size
    const entradas = meses.map(() => 0)
    const saidas = meses.map(() => 0)
    const ativosSerie = meses.map(() => 0)
    let ativosHa12Meses: number | null = null
    for (const l of fil.linhas) {
      const i = idx.get(l.mes)
      if (i !== undefined) {
        entradas[i] = l.entradas
        saidas[i] = l.saidas
        ativosSerie[i] = l.ativosFimMes
      } else if (l.mes < meses[0]) ativosHa12Meses = l.ativosFimMes
    }
    // O mês corrente ainda não fechou: o ponto de hoje é o cadastro vivo.
    if (fil.disponivel) ativosSerie[meses.length - 1] = ativosHoje
    let inadimplentes: { quantidade: number; configurado: boolean } | null = null
    try {
      const r = await relatorioInadimplencia()
      inadimplentes = { quantidade: r.lista.length, configurado: r.configurado }
    } catch {
      inadimplentes = null
    }
    filiacao = { ativosHoje, ativosHa12Meses, ativosSerie, entradas, saidas, inadimplentes }
  }

  // ── Arrecadação ───────────────────────────────────────────────────────────
  let arrecadacao: PainelExecutivo["arrecadacao"] = null
  if (veFiliacao) {
    const porTipo = new Map<string, number[]>()
    const totalPorMes = new Map<string, { valor: number; pagantes: number }>()
    for (const l of arr.linhas) {
      const t = totalPorMes.get(l.mes) ?? { valor: 0, pagantes: 0 }
      t.valor += l.valor
      t.pagantes += l.pagantes
      totalPorMes.set(l.mes, t)
      const i = idx.get(l.mes)
      if (i === undefined) continue
      const serie = porTipo.get(l.tipo) ?? meses.map(() => 0)
      serie[i] += l.valor
      porTipo.set(l.tipo, serie)
    }
    const mesesComValor = [...totalPorMes.keys()].sort()
    const ultimoMes = mesesComValor[mesesComValor.length - 1] ?? null
    const anterior = mesesComValor[mesesComValor.length - 2] ?? null
    arrecadacao = {
      ultimoMes,
      valorUltimoMes: ultimoMes ? totalPorMes.get(ultimoMes)!.valor : 0,
      valorMesAnterior: anterior ? totalPorMes.get(anterior)!.valor : null,
      pagantesUltimoMes: ultimoMes ? totalPorMes.get(ultimoMes)!.pagantes : 0,
      porTipo: topMaisOutros(porTipo, 4),
    }
  }

  // ── Financeiro ────────────────────────────────────────────────────────────
  let financeiro: PainelExecutivo["financeiro"] = null
  if (veFinanceiro) {
    const admin = await createAdminClient()
    const hoje = hojeSP()
    const abertas = await lerEmLotes<{ vencimento: string | null; valor_inicial_cobranca: number | null; valor_pago: number | null }>((de, ate) =>
      admin
        .from("ordens_pagamento")
        .select("vencimento, valor_inicial_cobranca, valor_pago")
        .eq("emp_proprietaria_id", emp)
        .not("excluido", "is", true)
        .in("situacao", [...SITUACOES_ABERTAS])
        .not("vencimento", "is", null)
        .order("id")
        .range(de, ate)
    ).catch(() => [])
    const limite30 = somarDias(hoje, 30)
    const aPagar30d = { quantidade: 0, valor: 0 }
    const vencidas = { quantidade: 0, valor: 0 }
    for (const o of abertas) {
      const v = Number(o.valor_pago ?? o.valor_inicial_cobranca ?? 0)
      const venc = String(o.vencimento).slice(0, 10)
      if (venc < hoje) {
        vencidas.quantidade++
        vencidas.valor += v
      } else if (venc <= limite30) {
        aPagar30d.quantidade++
        aPagar30d.valor += v
      }
    }
    let saldoCaixa: number | null = null
    if (podeAcessar(p, "financeiro_caixa", ["financeiro_caixa_admin", "configuracoes"])) {
      const { disponivel, contas } = await listarContasCaixa().catch(() => ({ disponivel: false, contas: [] }))
      if (disponivel) saldoCaixa = contas.filter((c) => c.ativa).reduce((s, c) => s + c.saldo, 0)
    }
    const porTipo = new Map<string, number[]>()
    let despesaUltimoMes = 0
    const mesFechado = meses[meses.length - 2]
    for (const l of desp.linhas) {
      const i = idx.get(l.mes)
      if (i === undefined) continue
      const serie = porTipo.get(l.tipo) ?? meses.map(() => 0)
      serie[i] += l.valor
      porTipo.set(l.tipo, serie)
      if (l.mes === mesFechado) despesaUltimoMes += l.valor
    }
    financeiro = { saldoCaixa, aPagar30d, vencidas, despesaPorTipo: topMaisOutros(porTipo, 4), despesaUltimoMes }
  }

  // ── Vencidos nas áreas que a pessoa cuida ─────────────────────────────────
  const vencidos = gruposDaPessoa(vencGrupos, p)
    .map((g) => ({ titulo: g.titulo, quantidade: g.itens.filter((i) => i.dias < 0).length, href: g.itens.find((i) => i.dias < 0)?.href ?? "/painel" }))
    .filter((g) => g.quantidade > 0)
    .sort((a, b) => b.quantidade - a.quantidade)
    .slice(0, 6)

  return {
    analiticaDisponivel,
    atualizacoes,
    meses,
    filiacao,
    arrecadacao,
    financeiro,
    vencidos,
    pendencias: totalPendencias(pend),
  }
}
