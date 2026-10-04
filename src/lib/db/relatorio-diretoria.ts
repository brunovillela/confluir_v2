import "server-only"

import type { SessaoPainel } from "@/lib/auth"
import { serieArrecadacao, serieDespesa, serieFiliacao } from "@/lib/db/analitica"
import { listarContasCaixa } from "@/lib/db/caixa"
import { hojeSP, lerEmLotes } from "@/lib/db/comum"
import { somarDias } from "@/lib/db/ferias"
import { SITUACOES_ABERTAS } from "@/lib/db/financeiro"
import { nomeEntidade } from "@/lib/db/organizacao"
import { gruposDaPessoa, vencimentosDoTenant } from "@/lib/db/vencimentos"
import { formatarMoeda } from "@/lib/formato"
import { gerarTextoIA } from "@/lib/ia"
import { podeAcessar } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * RELATÓRIO DA DIRETORIA EM UM CLIQUE (onda 3, D5): o mês em números —
 * filiação, arrecadação, despesa, caixa e pendências, ações do mês — e um
 * texto redigido pela IA a partir desses números (com um texto-padrão quando
 * a IA não está configurada). Vira PDF em /painel/indicadores/relatorio.
 */

export type RelatorioDiretoria = {
  mes: string
  mesRotulo: string
  entidade: string
  geradoEm: string
  filiacao: { ativosFim: number; ativosInicio: number | null; entradas: number; saidas: number } | null
  arrecadacao: { total: number; pagantes: number; porTipo: { tipo: string; valor: number; pagantes: number }[]; totalMesAnterior: number | null } | null
  despesa: { total: number; ordens: number; porTipo: { tipo: string; valor: number }[]; totalMesAnterior: number | null } | null
  caixa: { saldo: number | null; abertas: { q: number; v: number }; vencidas: { q: number; v: number }; aPagar30d: { q: number; v: number } } | null
  acoes: { demandasConcluidas: number | null; noticias: number | null }
  vencidosPorArea: { titulo: string; quantidade: number }[]
  paragrafos: string[]
  redigidoPorIA: boolean
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

export function rotuloDoMes(mes: string): string {
  const [a, m] = mes.split("-").map(Number)
  return `${MESES[(m ?? 1) - 1]} de ${a}`
}

function mesAnteriorDe(mes: string): string {
  const [a, m] = mes.split("-").map(Number)
  return new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7)
}

async function contarNoMes(tabela: string, coluna: string, mes: string, extra: Record<string, string> = {}): Promise<number | null> {
  try {
    const admin = await createAdminClient()
    const [a, m] = mes.split("-").map(Number)
    const fim = new Date(Date.UTC(a, m, 1)).toISOString()
    let q = admin.from(tabela).select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", await tenantAtual()).gte(coluna, `${mes}-01`).lt(coluna, fim)
    for (const [k, v] of Object.entries(extra)) q = q.eq(k, v)
    const { count, error } = await q
    return error ? null : (count ?? 0)
  } catch {
    return null
  }
}

export async function montarRelatorio(sessao: SessaoPainel, mes: string): Promise<RelatorioDiretoria> {
  const p = sessao.permissoes
  const emp = await tenantAtual()
  const hoje = hojeSP()
  const mesIso = `${mes}-01`
  const anterior = mesAnteriorDe(mes)
  const veFiliacao = podeAcessar(p, "filiacao_gestao", ["filiacao_filiados", "filiacao_receitas", "configuracoes"])
  const veFinanceiro = podeAcessar(p, "financeiro_leitura", ["financeiro_pagamento", "financeiro_caixa", "configuracoes"])
  // Quantos meses atrás está o mês pedido (para a janela das séries).
  const [ha, hm] = hoje.split("-").map(Number)
  const [ma, mm] = mes.split("-").map(Number)
  const mesesAtras = Math.max(2, (ha - ma) * 12 + (hm - mm) + 2)

  const [fil, arr, desp, grupos, entidade, demandasConcluidas, noticias] = await Promise.all([
    veFiliacao ? serieFiliacao(mesesAtras) : Promise.resolve({ disponivel: false, linhas: [] }),
    veFiliacao ? serieArrecadacao(mesesAtras) : Promise.resolve({ disponivel: false, linhas: [] }),
    veFinanceiro ? serieDespesa(mesesAtras) : Promise.resolve({ disponivel: false, linhas: [] }),
    vencimentosDoTenant(emp).catch(() => []),
    nomeEntidade().catch(() => "Entidade"),
    contarNoMes("demandas", "updated_at", mes, { situacao: "Feito" }),
    contarNoMes("noticias", "created_at", mes),
  ])

  let filiacao: RelatorioDiretoria["filiacao"] = null
  if (fil.disponivel) {
    const doMes = fil.linhas.find((l) => l.mes === mesIso)
    const doAnterior = fil.linhas.find((l) => l.mes === `${anterior}-01`)
    if (doMes) filiacao = { ativosFim: doMes.ativosFimMes, ativosInicio: doAnterior?.ativosFimMes ?? null, entradas: doMes.entradas, saidas: doMes.saidas }
  }

  let arrecadacao: RelatorioDiretoria["arrecadacao"] = null
  if (arr.disponivel) {
    const porTipo = new Map<string, { valor: number; pagantes: number }>()
    let totalAnterior = 0
    let temAnterior = false
    for (const l of arr.linhas) {
      if (l.mes === mesIso) {
        const t = porTipo.get(l.tipo) ?? { valor: 0, pagantes: 0 }
        t.valor += l.valor
        t.pagantes += l.pagantes
        porTipo.set(l.tipo, t)
      } else if (l.mes === `${anterior}-01`) {
        totalAnterior += l.valor
        temAnterior = true
      }
    }
    const lista = [...porTipo.entries()].map(([tipo, v]) => ({ tipo, ...v })).sort((a, b) => b.valor - a.valor)
    arrecadacao = {
      total: lista.reduce((s, x) => s + x.valor, 0),
      pagantes: lista.reduce((s, x) => s + x.pagantes, 0),
      porTipo: lista,
      totalMesAnterior: temAnterior ? totalAnterior : null,
    }
  }

  let despesa: RelatorioDiretoria["despesa"] = null
  if (desp.disponivel) {
    const porTipo = new Map<string, number>()
    let ordens = 0
    let totalAnterior = 0
    let temAnterior = false
    for (const l of desp.linhas) {
      if (l.mes === mesIso) {
        porTipo.set(l.tipo, (porTipo.get(l.tipo) ?? 0) + l.valor)
        ordens += l.ordens
      } else if (l.mes === `${anterior}-01`) {
        totalAnterior += l.valor
        temAnterior = true
      }
    }
    const lista = [...porTipo.entries()].map(([tipo, valor]) => ({ tipo, valor })).sort((a, b) => b.valor - a.valor)
    despesa = { total: lista.reduce((s, x) => s + x.valor, 0), ordens, porTipo: lista, totalMesAnterior: temAnterior ? totalAnterior : null }
  }

  let caixa: RelatorioDiretoria["caixa"] = null
  if (veFinanceiro) {
    const admin = await createAdminClient()
    const abertas = await lerEmLotes<{ vencimento: string | null; valor_inicial_cobranca: number | null; valor_pago: number | null }>((de, ate) =>
      admin
        .from("ordens_pagamento")
        .select("vencimento, valor_inicial_cobranca, valor_pago")
        .eq("emp_proprietaria_id", emp)
        .not("excluido", "is", true)
        .in("situacao", [...SITUACOES_ABERTAS])
        .order("id")
        .range(de, ate)
    ).catch(() => [])
    const em30 = somarDias(hoje, 30)
    const c = { abertas: { q: 0, v: 0 }, vencidas: { q: 0, v: 0 }, aPagar30d: { q: 0, v: 0 } }
    for (const o of abertas) {
      const v = Number(o.valor_pago ?? o.valor_inicial_cobranca ?? 0)
      c.abertas.q++
      c.abertas.v += v
      const venc = o.vencimento ? String(o.vencimento).slice(0, 10) : null
      if (venc && venc < hoje) {
        c.vencidas.q++
        c.vencidas.v += v
      } else if (venc && venc <= em30) {
        c.aPagar30d.q++
        c.aPagar30d.v += v
      }
    }
    let saldo: number | null = null
    if (podeAcessar(p, "financeiro_caixa", ["financeiro_caixa_admin", "configuracoes"])) {
      const r = await listarContasCaixa().catch(() => ({ disponivel: false, contas: [] }))
      if (r.disponivel) saldo = r.contas.filter((x) => x.ativa).reduce((s, x) => s + x.saldo, 0)
    }
    caixa = { saldo, ...c }
  }

  const vencidosPorArea = gruposDaPessoa(grupos, p)
    .map((g) => ({ titulo: g.titulo, quantidade: g.itens.filter((i) => i.dias < 0).length }))
    .filter((g) => g.quantidade > 0)
    .sort((a, b) => b.quantidade - a.quantidade)

  const base: Omit<RelatorioDiretoria, "paragrafos" | "redigidoPorIA"> = {
    mes,
    mesRotulo: rotuloDoMes(mes),
    entidade,
    geradoEm: new Date().toISOString(),
    filiacao,
    arrecadacao,
    despesa,
    caixa,
    acoes: { demandasConcluidas, noticias },
    vencidosPorArea,
  }
  const { paragrafos, redigidoPorIA } = await redigir(base)
  return { ...base, paragrafos, redigidoPorIA }
}

function variacao(atual: number, anterior: number | null): string {
  if (anterior === null || anterior === 0) return ""
  const pct = ((atual - anterior) / anterior) * 100
  return ` (${pct >= 0 ? "+" : ""}${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% em relação ao mês anterior)`
}

/** Texto-padrão, sem IA: direto dos números. */
function textoPadrao(d: Omit<RelatorioDiretoria, "paragrafos" | "redigidoPorIA">): string[] {
  const p: string[] = []
  if (d.filiacao) {
    p.push(
      `A ${d.entidade} encerrou ${d.mesRotulo} com ${d.filiacao.ativosFim.toLocaleString("pt-BR")} filiados ativos${d.filiacao.ativosInicio !== null ? ` (${d.filiacao.ativosInicio.toLocaleString("pt-BR")} no fim do mês anterior)` : ""}. No mês houve ${d.filiacao.entradas} ${d.filiacao.entradas === 1 ? "nova filiação" : "novas filiações"} e ${d.filiacao.saidas} ${d.filiacao.saidas === 1 ? "desfiliação" : "desfiliações"}.`
    )
  }
  if (d.arrecadacao) {
    p.push(
      `A arrecadação informada nas remessas das fontes somou ${formatarMoeda(d.arrecadacao.total)}${variacao(d.arrecadacao.total, d.arrecadacao.totalMesAnterior)}, com ${d.arrecadacao.pagantes.toLocaleString("pt-BR")} pagantes` +
        (d.arrecadacao.porTipo.length > 1 ? `: ${d.arrecadacao.porTipo.map((t) => `${t.tipo} ${formatarMoeda(t.valor)}`).join(", ")}.` : ".")
    )
  }
  if (d.despesa) {
    p.push(
      `As despesas pagas no mês somaram ${formatarMoeda(d.despesa.total)} em ${d.despesa.ordens} ${d.despesa.ordens === 1 ? "ordem" : "ordens"}${variacao(d.despesa.total, d.despesa.totalMesAnterior)}` +
        (d.despesa.porTipo.length ? `, com destaque para ${d.despesa.porTipo.slice(0, 3).map((t) => `${t.tipo} (${formatarMoeda(t.valor)})`).join(", ")}.` : ".")
    )
  }
  if (d.caixa) {
    p.push(
      `${d.caixa.saldo !== null ? `Os caixas da entidade somam ${formatarMoeda(d.caixa.saldo)}. ` : ""}Há ${d.caixa.abertas.q} ${d.caixa.abertas.q === 1 ? "ordem aberta" : "ordens abertas"} (${formatarMoeda(d.caixa.abertas.v)}), das quais ${d.caixa.vencidas.q} ${d.caixa.vencidas.q === 1 ? "vencida" : "vencidas"} (${formatarMoeda(d.caixa.vencidas.v)}) e ${d.caixa.aPagar30d.q} com vencimento nos próximos 30 dias (${formatarMoeda(d.caixa.aPagar30d.v)}).`
    )
  }
  const acoes: string[] = []
  if (d.acoes.demandasConcluidas !== null) acoes.push(`${d.acoes.demandasConcluidas} ${d.acoes.demandasConcluidas === 1 ? "demanda concluída" : "demandas concluídas"}`)
  if (d.acoes.noticias !== null) acoes.push(`${d.acoes.noticias} ${d.acoes.noticias === 1 ? "notícia publicada" : "notícias publicadas"}`)
  if (acoes.length) p.push(`Ações do mês: ${acoes.join(" e ")}.`)
  if (d.vencidosPorArea.length) p.push(`Atenção para o que está vencido: ${d.vencidosPorArea.map((v) => `${v.titulo} (${v.quantidade})`).join(", ")}.`)
  return p
}

async function redigir(d: Omit<RelatorioDiretoria, "paragrafos" | "redigidoPorIA">): Promise<{ paragrafos: string[]; redigidoPorIA: boolean }> {
  const padrao = textoPadrao(d)
  const r = await gerarTextoIA({
    system:
      "Você redige o relatório mensal da diretoria de uma entidade sindical brasileira, em português do Brasil, tom institucional e direto. Use SOMENTE os números fornecidos; não invente dados nem explique causas que não estejam nos dados. Escreva de 3 a 6 parágrafos curtos, sem títulos, sem listas, sem markdown. Valores em reais no formato R$ 1.234,56.",
    prompt: `Mês: ${d.mesRotulo}. Entidade: ${d.entidade}.\nDados (JSON): ${JSON.stringify({ filiacao: d.filiacao, arrecadacao: d.arrecadacao, despesa: d.despesa, caixa: d.caixa, acoes: d.acoes, vencidos: d.vencidosPorArea })}\n\nTexto-base que você pode melhorar (mantendo os números exatos):\n${padrao.join("\n")}`,
    maxTokens: 1200,
  })
  if (r.erro || !r.texto) return { paragrafos: padrao, redigidoPorIA: false }
  const paragrafos = r.texto
    .split(/\n\s*\n/)
    .map((x) => x.replace(/\s+/g, " ").trim())
    .filter(Boolean)
  return paragrafos.length ? { paragrafos, redigidoPorIA: true } : { paragrafos: padrao, redigidoPorIA: false }
}
