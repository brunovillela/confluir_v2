import "server-only"

import { rotuloMotivoDesfiliacao } from "@/lib/churn-constantes"
import { hojeSP, lerEmLotes, texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * CHURN E RETENÇÃO (onda 4, I6). Lê os vínculos (fonte, filiação,
 * desfiliação) e os cadastros (condição, inativo_em, motivo) e calcula, para
 * os últimos 12 meses: saídas e entradas por mês, taxa mensal por fonte
 * (saídas ÷ ativos no início do mês), tempo médio e mediano de filiação de
 * quem saiu, e a distribuição de motivos. Cache de 10 minutos por tenant —
 * a conta percorre todos os vínculos.
 */

export type ChurnMes = { mes: string; entradas: number; saidas: number; ativosInicio: number; taxa: number | null }
export type ChurnFonte = {
  fonteId: string
  fonte: string
  ativos: number
  saidas12m: number
  entradas12m: number
  /** Saídas dos 12 meses ÷ ativos de 12 meses atrás (anual). */
  taxaAnual: number | null
}
export type ChurnMotivo = { chave: string | null; rotulo: string; quantidade: number }
export type SemMotivo = { id: string; nome: string | null; saidaEm: string | null; condicao: string | null }

export type Churn = {
  meses: ChurnMes[]
  fontes: ChurnFonte[]
  motivos: ChurnMotivo[]
  semMotivo: SemMotivo[]
  saidas12m: number
  entradas12m: number
  /** Em anos, de quem saiu nos últimos 12 meses. */
  tempoMedioAnos: number | null
  tempoMedianoAnos: number | null
  /** Taxa mensal média dos 12 meses (%). */
  taxaMediaMensal: number | null
  comMotivoPct: number | null
  /** false = falta rodar supabase/filiacao-motivo-desfiliacao.sql. */
  motivoDisponivel: boolean
  geradoEm: string
}

const VALIDADE_MS = 10 * 60 * 1000
const cache = new Map<string, { dados: Churn; expira: number }>()

export function invalidarCacheChurn() {
  cache.clear()
}

function mesDe(iso: string): string {
  return iso.slice(0, 7)
}

function mesesAtras(n: number): string[] {
  const hoje = hojeSP()
  const [a, m] = hoje.split("-").map(Number)
  const lista: string[] = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(a, m - 1 - i, 1))
    lista.push(d.toISOString().slice(0, 7))
  }
  return lista
}

export async function churn(): Promise<Churn> {
  const emp = await tenantAtual()
  const emCache = cache.get(emp)
  if (emCache && emCache.expira > Date.now()) return emCache.dados

  const admin = await createAdminClient()
  const meses = mesesAtras(12)
  const inicioJanela = `${meses[0]}-01`
  const hoje = hojeSP()

  type Vinculo = { filiado_id: string; fonte_pagadora_id: string | null; entrada: string | null; saida: string | null }
  const vinculos = (
    await lerEmLotes<Record<string, unknown>>((de, ate) =>
      admin
        .from("filiacao_vinculos")
        .select("filiado_id, fonte_pagadora_id, data_filiacao, filiacao_data_adesao, data_desfiliacao, filiacao_data_saida")
        .eq("emp_proprietaria_id", emp)
        .order("id", { ascending: true })
        .range(de, ate)
    )
  ).map(
    (v): Vinculo => ({
      filiado_id: String(v.filiado_id),
      fonte_pagadora_id: texto(v.fonte_pagadora_id),
      entrada: (texto(v.data_filiacao) ?? texto(v.filiacao_data_adesao))?.slice(0, 10) ?? null,
      saida: (texto(v.data_desfiliacao) ?? texto(v.filiacao_data_saida))?.slice(0, 10) ?? null,
    })
  )

  // Cadastros: condição, data de saída e motivo (colunas do motivo podem não existir).
  let motivoDisponivel = true
  let cadastros: Record<string, unknown>[] = []
  const comMotivo = await lerEmLotes<Record<string, unknown>>((de, ate) =>
    admin
      .from("filiacoes")
      .select("id, nome_completo, filiacao_condicao, ativo_em, inativo_em, condicao_desde, desfiliacao_motivo")
      .eq("emp_proprietaria_id", emp)
      .not("filiacao_excluida", "is", true)
      .is("mesclado_em", null)
      .order("id", { ascending: true })
      .range(de, ate)
  ).catch(() => null)
  if (comMotivo) cadastros = comMotivo
  else {
    motivoDisponivel = false
    cadastros = await lerEmLotes<Record<string, unknown>>((de, ate) =>
      admin
        .from("filiacoes")
        .select("id, nome_completo, filiacao_condicao, ativo_em, inativo_em, condicao_desde")
        .eq("emp_proprietaria_id", emp)
        .not("filiacao_excluida", "is", true)
        .is("mesclado_em", null)
        .order("id", { ascending: true })
        .range(de, ate)
    ).catch(() => [])
  }

  // Por pessoa: primeira entrada e última saída (mesma régua da camada analítica).
  const primeiraEntrada = new Map<string, string>()
  const ultimaSaida = new Map<string, string>()
  for (const v of vinculos) {
    if (v.entrada && (!primeiraEntrada.has(v.filiado_id) || v.entrada < primeiraEntrada.get(v.filiado_id)!)) primeiraEntrada.set(v.filiado_id, v.entrada)
    if (v.saida && (!ultimaSaida.has(v.filiado_id) || v.saida > ultimaSaida.get(v.filiado_id)!)) ultimaSaida.set(v.filiado_id, v.saida)
  }
  type Pessoa = { id: string; nome: string | null; ativo: boolean; condicao: string | null; entrada: string | null; saida: string | null; motivo: string | null }
  const pessoas: Pessoa[] = cadastros.map((c) => {
    const id = String(c.id)
    const ativo = c.filiacao_condicao === "Ativo"
    const entrada = texto(c.ativo_em)?.slice(0, 10) ?? primeiraEntrada.get(id) ?? null
    const saida = ativo ? null : (texto(c.inativo_em)?.slice(0, 10) ?? ultimaSaida.get(id) ?? null)
    return { id, nome: texto(c.nome_completo), ativo, condicao: texto(c.filiacao_condicao), entrada, saida, motivo: texto(c.desfiliacao_motivo) }
  })

  // ── Série mensal (pessoas) ─────────────────────────────────────────────────
  const entradasMes = new Map<string, number>()
  const saidasMes = new Map<string, number>()
  for (const p of pessoas) {
    if (p.entrada && p.entrada >= inicioJanela) entradasMes.set(mesDe(p.entrada), (entradasMes.get(mesDe(p.entrada)) ?? 0) + 1)
    if (p.saida && p.saida >= inicioJanela && p.saida <= hoje) saidasMes.set(mesDe(p.saida), (saidasMes.get(mesDe(p.saida)) ?? 0) + 1)
  }
  const ativosNoInicio = (mes: string): number => {
    const corte = `${mes}-01`
    let n = 0
    for (const p of pessoas) {
      const entrada = p.entrada ?? (p.ativo ? corte : null)
      if (!entrada || entrada >= corte) continue
      if (p.saida && p.saida < corte) continue
      if (!p.ativo && !p.saida) continue
      n++
    }
    return n
  }
  const serie: ChurnMes[] = meses.map((mes) => {
    const ativosInicio = ativosNoInicio(mes)
    const saidas = saidasMes.get(mes) ?? 0
    return { mes, entradas: entradasMes.get(mes) ?? 0, saidas, ativosInicio, taxa: ativosInicio > 0 ? (saidas / ativosInicio) * 100 : null }
  })

  // ── Por fonte (vínculos) ───────────────────────────────────────────────────
  const porFonte = new Map<string, { ativos: number; saidas: number; entradas: number; ativosHa12m: number }>()
  const ha12m = inicioJanela
  for (const v of vinculos) {
    if (!v.fonte_pagadora_id) continue
    const f = porFonte.get(v.fonte_pagadora_id) ?? { ativos: 0, saidas: 0, entradas: 0, ativosHa12m: 0 }
    const aberto = !v.saida || v.saida > hoje
    if (aberto) f.ativos++
    if (v.saida && v.saida >= inicioJanela && v.saida <= hoje) f.saidas++
    if (v.entrada && v.entrada >= inicioJanela) f.entradas++
    if (v.entrada && v.entrada < ha12m && (!v.saida || v.saida >= ha12m)) f.ativosHa12m++
    porFonte.set(v.fonte_pagadora_id, f)
  }
  const fonteIds = [...porFonte.keys()]
  const nomes = new Map<string, string>()
  for (let de = 0; de < fonteIds.length; de += 200) {
    const { data } = await admin.from("empresa").select("id, nome_fantasia, nome_razao").in("id", fonteIds.slice(de, de + 200))
    for (const e of data ?? []) nomes.set(String(e.id), texto(e.nome_fantasia) ?? texto(e.nome_razao) ?? "(sem nome)")
  }
  const fontes: ChurnFonte[] = fonteIds
    .map((id) => {
      const f = porFonte.get(id)!
      return {
        fonteId: id,
        fonte: nomes.get(id) ?? "(fonte)",
        ativos: f.ativos,
        saidas12m: f.saidas,
        entradas12m: f.entradas,
        taxaAnual: f.ativosHa12m > 0 ? (f.saidas / f.ativosHa12m) * 100 : null,
      }
    })
    .filter((f) => f.ativos > 0 || f.saidas12m > 0)
    .sort((a, b) => b.saidas12m - a.saidas12m || b.ativos - a.ativos)
    .slice(0, 40)

  // ── Tempo de filiação e motivos (quem saiu nos 12 meses) ───────────────────
  const sairam = pessoas.filter((p) => p.saida && p.saida >= inicioJanela && p.saida <= hoje)
  const duracoes = sairam
    .filter((p) => p.entrada && p.saida && p.entrada <= p.saida!)
    .map((p) => (new Date(p.saida!).getTime() - new Date(p.entrada!).getTime()) / (365.25 * 86_400_000))
    .sort((a, b) => a - b)
  const media = duracoes.length ? duracoes.reduce((s, v) => s + v, 0) / duracoes.length : null
  const mediana = duracoes.length ? duracoes[Math.floor(duracoes.length / 2)] : null

  const contagem = new Map<string | null, number>()
  for (const p of sairam) contagem.set(p.motivo, (contagem.get(p.motivo) ?? 0) + 1)
  const motivos: ChurnMotivo[] = [...contagem.entries()]
    .map(([chave, quantidade]) => ({ chave, rotulo: rotuloMotivoDesfiliacao(chave), quantidade }))
    .sort((a, b) => b.quantidade - a.quantidade)
  const comMotivoN = sairam.filter((p) => p.motivo).length

  const semMotivo: SemMotivo[] = sairam
    .filter((p) => !p.motivo)
    .sort((a, b) => (b.saida ?? "").localeCompare(a.saida ?? ""))
    .slice(0, 50)
    .map((p) => ({ id: p.id, nome: p.nome, saidaEm: p.saida, condicao: p.condicao }))

  const taxas = serie.map((m) => m.taxa).filter((t): t is number => t !== null)
  const dados: Churn = {
    meses: serie,
    fontes,
    motivos,
    semMotivo,
    saidas12m: sairam.length,
    entradas12m: serie.reduce((s, m) => s + m.entradas, 0),
    tempoMedioAnos: media,
    tempoMedianoAnos: mediana,
    taxaMediaMensal: taxas.length ? taxas.reduce((s, v) => s + v, 0) / taxas.length : null,
    comMotivoPct: sairam.length ? (comMotivoN / sairam.length) * 100 : null,
    motivoDisponivel,
    geradoEm: new Date().toISOString(),
  }
  cache.set(emp, { dados, expira: Date.now() + VALIDADE_MS })
  return dados
}

/** Grava o motivo de desfiliação de um cadastro (ficha ou tela de churn). */
export async function definirMotivoDesfiliacao(
  filiacaoId: string,
  motivo: string | null,
  detalhe: string | null
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("filiacoes")
    .update({ desfiliacao_motivo: motivo, desfiliacao_motivo_detalhe: detalhe, updated_at: new Date().toISOString() })
    .eq("id", filiacaoId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) {
    if (["PGRST204", "42703"].includes(error.code ?? "")) return { erro: "Falta rodar o SQL supabase/filiacao-motivo-desfiliacao.sql." }
    return { erro: error.message }
  }
  invalidarCacheChurn()
  return {}
}
