import "server-only"

import { serieArrecadacao, serieDespesa } from "@/lib/db/analitica"
import { esquemaAusente, hojeSP, lerEmLotes, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { opcoesFiltrosOrdens, SITUACOES_ABERTAS } from "@/lib/db/financeiro"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * FINANCEIRO GERENCIAL (onda 3, I3/I5): o que a direção precisa enxergar
 * antes de aprovar — fluxo projetado (a pagar por vencimento × receita
 * prevista), despesa por centro de custo, departamento ou tipo ao longo
 * dos meses, orçado × realizado por centro de custo, ordens vencidas e
 * fontes pagadoras com remessa em atraso. Séries mensais vêm da camada
 * analítica (lib/db/analitica.ts); o que é "de hoje" é lido na hora.
 */

export const AVISO_SQL_ORCAMENTOS = "Orçamentos ainda não configurados — rode supabase/orcamentos.sql."

function mesDe(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

function mesesDesde(primeiro: string, quantidade: number): string[] {
  const [a, m] = primeiro.split("-").map(Number)
  return Array.from({ length: quantidade }, (_, i) => new Date(Date.UTC(a, m - 1 + i, 1)).toISOString().slice(0, 10))
}

// ── Fluxo projetado ──────────────────────────────────────────────────────────

export type FluxoMes = { mes: string; aPagar: number; ordens: number; receitaPrevista: number }
export type FluxoProjetado = {
  meses: FluxoMes[]
  vencidas: { quantidade: number; valor: number }
  /** Média mensal da arrecadação nos últimos meses com remessa (base da receita prevista). */
  receitaBase: { media: number; mesesBase: string[] }
}

export async function fluxoProjetado(mesesAFrente = 4): Promise<FluxoProjetado> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeSP()
  const meses = mesesDesde(mesDe(hoje), mesesAFrente)
  const porMes = new Map(meses.map((m) => [m, { mes: m, aPagar: 0, ordens: 0, receitaPrevista: 0 }]))
  const vencidas = { quantidade: 0, valor: 0 }

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
  for (const o of abertas) {
    const v = Number(o.valor_pago ?? o.valor_inicial_cobranca ?? 0)
    const venc = String(o.vencimento).slice(0, 10)
    if (venc < hoje) {
      vencidas.quantidade++
      vencidas.valor += v
      continue
    }
    const bucket = porMes.get(mesDe(venc)) ?? porMes.get(meses[meses.length - 1])!
    bucket.aPagar += v
    bucket.ordens++
  }

  // Receita prevista = média dos últimos 3 meses fechados com remessa.
  const arr = await serieArrecadacao(8).catch(() => ({ disponivel: false, linhas: [] }))
  const totalPorMes = new Map<string, number>()
  for (const l of arr.linhas) totalPorMes.set(l.mes, (totalPorMes.get(l.mes) ?? 0) + l.valor)
  const mesesBase = [...totalPorMes.entries()]
    .filter(([m, v]) => v > 0 && m < meses[0])
    .map(([m]) => m)
    .sort()
    .slice(-3)
  const media = mesesBase.length ? mesesBase.reduce((s, m) => s + (totalPorMes.get(m) ?? 0), 0) / mesesBase.length : 0
  for (const b of porMes.values()) b.receitaPrevista = media

  return { meses: [...porMes.values()], vencidas, receitaBase: { media, mesesBase } }
}

// ── Despesa por dimensão ─────────────────────────────────────────────────────

export type DimensaoDespesa = "centro" | "departamento" | "tipo"
export type LinhaPivot = { id: string | null; nome: string; valores: number[]; total: number }
export type PivotDespesa = { disponivel: boolean; meses: string[]; linhas: LinhaPivot[]; totalPorMes: number[]; total: number }

const MAX_LINHAS = 15

export async function despesaPor(dimensao: DimensaoDespesa, meses = 12): Promise<PivotDespesa> {
  const [serie, opcoes] = await Promise.all([serieDespesa(meses), opcoesFiltrosOrdens().catch(() => null)])
  const hoje = hojeSP()
  const lista = mesesDesde(mesDe(hoje), 1)
  const inicio = new Date(Date.UTC(Number(lista[0].slice(0, 4)), Number(lista[0].slice(5, 7)) - meses, 1)).toISOString().slice(0, 10)
  const eixo = mesesDesde(inicio, meses)
  const idx = new Map(eixo.map((m, i) => [m, i]))
  const nome = (id: string | null, tipo: string): string => {
    if (dimensao === "tipo") return tipo
    if (!id) return dimensao === "centro" ? "(sem centro de custo)" : "(sem departamento)"
    const achado = dimensao === "centro" ? opcoes?.centrosCusto.find((c) => c.id === id) : opcoes?.departamentos.find((d) => d.id === id)
    return achado?.nome ?? "(desconhecido)"
  }
  const por = new Map<string, LinhaPivot>()
  for (const l of serie.linhas) {
    const i = idx.get(l.mes)
    if (i === undefined) continue
    const id = dimensao === "centro" ? l.centroCustoId : dimensao === "departamento" ? l.departamentoId : null
    const chave = dimensao === "tipo" ? l.tipo : (id ?? "")
    const linha = por.get(chave) ?? { id, nome: nome(id, l.tipo), valores: eixo.map(() => 0), total: 0 }
    linha.valores[i] += l.valor
    linha.total += l.valor
    por.set(chave, linha)
  }
  const ordenadas = [...por.values()].sort((a, b) => b.total - a.total)
  const linhas = ordenadas.slice(0, MAX_LINHAS)
  const resto = ordenadas.slice(MAX_LINHAS)
  if (resto.length) {
    linhas.push({
      id: null,
      nome: `Outros (${resto.length})`,
      valores: eixo.map((_, i) => resto.reduce((s, l) => s + l.valores[i], 0)),
      total: resto.reduce((s, l) => s + l.total, 0),
    })
  }
  const totalPorMes = eixo.map((_, i) => ordenadas.reduce((s, l) => s + l.valores[i], 0))
  return { disponivel: serie.disponivel, meses: eixo, linhas, totalPorMes, total: totalPorMes.reduce((s, v) => s + v, 0) }
}

// ── Orçado × realizado ───────────────────────────────────────────────────────

export type OrcadoRealizado = {
  centroId: string
  nome: string
  orcado: number
  realizado: number
  /** Parcela do orçamento que já deveria ter sido consumida (ano corrente: meses decorridos / 12). */
  esperadoAteAgora: number
  pct: number
}

export async function orcadoRealizado(ano: number): Promise<{
  disponivel: boolean
  orcamentosDisponiveis: boolean
  linhas: OrcadoRealizado[]
  centros: { id: string; nome: string }[]
  totalOrcado: number
  totalRealizado: number
}> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeSP()
  const anoAtual = Number(hoje.slice(0, 4))
  const mesesDecorridos = ano < anoAtual ? 12 : ano > anoAtual ? 0 : Number(hoje.slice(5, 7))
  const mesesAtras = Math.max(1, (anoAtual - ano) * 12 + Number(hoje.slice(5, 7)))
  const [serie, opcoes, orc] = await Promise.all([
    serieDespesa(Math.min(mesesAtras, 36)),
    opcoesFiltrosOrdens().catch(() => null),
    admin.from("financeiro_orcamentos").select("centro_custo_id, valor_anual").eq("emp_proprietaria_id", emp).eq("ano", ano),
  ])
  const orcamentosDisponiveis = !orc.error
  if (orc.error && !esquemaAusente(orc.error)) throw new Error(`Falha ao ler os orçamentos: ${orc.error.message}`)
  const centros = (opcoes?.centrosCusto ?? []).map((c) => ({ id: c.id, nome: c.nome }))
  const nomeDe = new Map(centros.map((c) => [c.id, c.nome]))
  const realizadoPor = new Map<string, number>()
  for (const l of serie.linhas) {
    if (!l.mes.startsWith(String(ano)) || !l.centroCustoId) continue
    realizadoPor.set(l.centroCustoId, (realizadoPor.get(l.centroCustoId) ?? 0) + l.valor)
  }
  const orcadoPor = new Map<string, number>()
  for (const o of orc.data ?? []) orcadoPor.set(String(o.centro_custo_id), Number(o.valor_anual ?? 0))
  const ids = new Set([...orcadoPor.keys(), ...realizadoPor.keys()])
  const linhas: OrcadoRealizado[] = [...ids]
    .map((id) => {
      const orcado = orcadoPor.get(id) ?? 0
      const realizado = realizadoPor.get(id) ?? 0
      return {
        centroId: id,
        nome: nomeDe.get(id) ?? "(centro de custo desconhecido)",
        orcado,
        realizado,
        esperadoAteAgora: (orcado * mesesDecorridos) / 12,
        pct: orcado > 0 ? realizado / orcado : 0,
      }
    })
    .sort((a, b) => b.realizado - a.realizado || b.orcado - a.orcado)
  return {
    disponivel: serie.disponivel,
    orcamentosDisponiveis,
    linhas,
    centros,
    totalOrcado: linhas.reduce((s, l) => s + l.orcado, 0),
    totalRealizado: linhas.reduce((s, l) => s + l.realizado, 0),
  }
}

export async function salvarOrcamento(
  dados: { ano: number; centroCustoId: string; valorAnual: number; usuarioId: string }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  if (dados.valorAnual <= 0) {
    const { error } = await admin.from("financeiro_orcamentos").delete().eq("emp_proprietaria_id", emp).eq("ano", dados.ano).eq("centro_custo_id", dados.centroCustoId)
    if (error) return { erro: esquemaAusente(error) ? AVISO_SQL_ORCAMENTOS : error.message }
    return {}
  }
  const { error } = await admin.from("financeiro_orcamentos").upsert(
    {
      emp_proprietaria_id: emp,
      ano: dados.ano,
      centro_custo_id: dados.centroCustoId,
      valor_anual: Math.round(dados.valorAnual * 100) / 100,
      atualizado_por: dados.usuarioId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id,ano,centro_custo_id" }
  )
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL_ORCAMENTOS : error.message }
  return {}
}

// ── Ordens vencidas ──────────────────────────────────────────────────────────

export type OrdemVencida = { id: string; codigo: string | null; descricao: string | null; favorecido: string | null; situacao: string | null; valor: number; vencimento: string; dias: number }

export async function ordensVencidas(limite = 60): Promise<{ linhas: OrdemVencida[]; total: number; valorTotal: number }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeSP()
  const brutas = await lerEmLotes<Record<string, unknown>>((de, ate) =>
    admin
      .from("ordens_pagamento")
      .select("id, codigo, descricao, situacao, valor_inicial_cobranca, valor_pago, vencimento, beneficiario_fornecedor_id, beneficiario_usuario_id, beneficiario_nome_avulso")
      .eq("emp_proprietaria_id", emp)
      .not("excluido", "is", true)
      .in("situacao", [...SITUACOES_ABERTAS])
      .lt("vencimento", hoje)
      .order("vencimento", { ascending: true })
      .order("id")
      .range(de, ate)
  ).catch(() => [])
  const recorte = brutas.slice(0, limite)
  const empresaIds = [...new Set(recorte.map((o) => texto(o.beneficiario_fornecedor_id)).filter((v): v is string => !!v))]
  const usuarioIds = recorte.map((o) => texto(o.beneficiario_usuario_id)).filter((v): v is string => !!v)
  const [empresas, usuarios] = await Promise.all([
    empresaIds.length ? admin.from("empresa").select("id, nome_fantasia, nome_razao").in("id", empresaIds) : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    nomesDosUsuarios(usuarioIds),
  ])
  const nomeEmpresa = new Map((empresas.data ?? []).map((e) => [String(e.id), texto(e.nome_fantasia) ?? texto(e.nome_razao) ?? "(sem nome)"]))
  const dia = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10))
  const linhas = recorte.map((o) => {
    const venc = String(o.vencimento).slice(0, 10)
    return {
      id: String(o.id),
      codigo: texto(o.codigo),
      descricao: texto(o.descricao),
      favorecido:
        (texto(o.beneficiario_fornecedor_id) && nomeEmpresa.get(String(o.beneficiario_fornecedor_id))) ||
        (texto(o.beneficiario_usuario_id) && usuarios.get(String(o.beneficiario_usuario_id))) ||
        texto(o.beneficiario_nome_avulso),
      situacao: texto(o.situacao),
      valor: Number(o.valor_pago ?? o.valor_inicial_cobranca ?? 0),
      vencimento: venc,
      dias: Math.round((dia(hoje) - dia(venc)) / 86_400_000),
    }
  })
  return { linhas, total: brutas.length, valorTotal: brutas.reduce((s, o) => s + Number(o.valor_pago ?? o.valor_inicial_cobranca ?? 0), 0) }
}

// ── Fontes com remessa em atraso ─────────────────────────────────────────────

export type FonteAtraso = { id: string; nome: string; filiadosAtivos: number; ultimoMes: string | null; mesesSemRemessa: number; valorUltimo: number }

export async function fontesEmAtraso(): Promise<{ disponivel: boolean; fontes: FonteAtraso[]; mesEsperado: string }> {
  const [serie, fontes] = await Promise.all([serieArrecadacao(12), listarFontesPagadoras().catch(() => [])])
  const hoje = hojeSP()
  const [a, m] = hoje.split("-").map(Number)
  const mesEsperado = new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 10) // o mês anterior já deveria ter remessa
  const ultimo = new Map<string, { mes: string; valor: number }>()
  for (const l of serie.linhas) {
    if (!l.fonteId) continue
    const atual = ultimo.get(l.fonteId)
    if (!atual || atual.mes < l.mes) ultimo.set(l.fonteId, { mes: l.mes, valor: l.valor })
    else if (atual.mes === l.mes) atual.valor += l.valor
  }
  const diffMeses = (de: string | null, ate: string) => (de ? (Number(ate.slice(0, 4)) - Number(de.slice(0, 4))) * 12 + Number(ate.slice(5, 7)) - Number(de.slice(5, 7)) : 99)
  const lista: FonteAtraso[] = fontes
    .filter((f) => f.inativa !== true && f.filiadosAtivos > 0)
    .map((f) => {
      const u = ultimo.get(f.id) ?? null
      return {
        id: f.id,
        nome: f.nome_fantasia ?? f.nome_razao ?? "(sem nome)",
        filiadosAtivos: f.filiadosAtivos,
        ultimoMes: u?.mes ?? null,
        mesesSemRemessa: diffMeses(u?.mes ?? null, mesEsperado),
        valorUltimo: u?.valor ?? 0,
      }
    })
    .filter((f) => f.mesesSemRemessa > 0)
    .sort((a, b) => b.filiadosAtivos - a.filiadosAtivos)
  return { disponivel: serie.disponivel, fontes: lista, mesEsperado }
}
