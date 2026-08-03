import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { derivarSituacao } from "@/lib/db/compras"
import { ROTULOS_SITUACAO_PROCESSO } from "@/lib/compras-constantes"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Projetos — tabela `projeto` (101 registros migrados do Bubble). É a dimensão
 * orçamentária que amarra Compras: `compras_solicitacoes.solicitacao_projeto_id`
 * aponta para daqui (1.868 de 6.525 solicitações vinculadas). O gasto exibido é
 * a soma de `compra_valor` das solicitações do projeto — não há vínculo direto
 * de `ordens_pagamento` com projeto no legado (`ordens_pagamento_raw` veio vazio).
 *
 * Convenções da tabela:
 * • `descricao_sumaria` = título do projeto (o campo `descricao` veio sempre nulo).
 * • `detalhamento` = texto longo.
 * • `tipo` ∈ TIPOS_PROJETO (sempre preenchido).
 * • `finalizado` deriva a situação; `estrategico` existe mas nunca foi usado.
 * • `departamentos_assoc_raw` = array de bubble_ids de `empresa_departamentos`.
 */

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null
}

function numero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

/** JSONB que pode ter vindo como string serializada na migração (padrão Bubble). */
function listaJsonb(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String)
  if (typeof v === "string" && v.trim().startsWith("[")) {
    try {
      const arr = JSON.parse(v)
      return Array.isArray(arr) ? arr.map(String) : []
    } catch {
      return []
    }
  }
  return []
}

// ── Gasto por projeto (via Compras) ─────────────────────────────────────────

/**
 * Soma de `compra_valor` das solicitações de compra, agrupada por projeto.
 * Uma consulta só para a tela de listagem, evitando N+1.
 */
async function gastoPorProjeto(
  projetoIds: string[]
): Promise<Map<string, { total: number; solicitacoes: number }>> {
  const mapa = new Map<string, { total: number; solicitacoes: number }>()
  const ids = [...new Set(projetoIds.filter(Boolean))]
  if (ids.length === 0) return mapa

  const admin = await createAdminClient()
  // PostgREST devolve no máximo 1.000 linhas por requisição; há ~1.868
  // solicitações vinculadas a projetos, então paginamos por `range` até
  // esgotar para não subestimar o gasto.
  const PAGINA = 1000
  for (let inicio = 0; ; inicio += PAGINA) {
    const { data } = await admin
      .from("compras_solicitacoes")
      .select("solicitacao_projeto_id, compra_valor")
      .in("solicitacao_projeto_id", ids)
      .range(inicio, inicio + PAGINA - 1)

    const linhas = data ?? []
    for (const linha of linhas) {
      const pid = linha.solicitacao_projeto_id as string | null
      if (!pid) continue
      const atual = mapa.get(pid) ?? { total: 0, solicitacoes: 0 }
      atual.total += numero(linha.compra_valor) ?? 0
      atual.solicitacoes += 1
      mapa.set(pid, atual)
    }
    if (linhas.length < PAGINA) break
  }
  return mapa
}

// ── Listagem ────────────────────────────────────────────────────────────────

export type ProjetoLinha = {
  id: string
  titulo: string | null
  tipo: string | null
  orcamento: number | null
  inicio: string | null
  termino_previsao: string | null
  finalizado: boolean | null
  estrategico: boolean | null
  gastoCompras: number
  solicitacoes: number
}

export type FiltroProjetos = {
  busca?: string
  tipo?: string
  situacao?: "andamento" | "finalizados" | "todos"
}

export async function listarProjetos(
  filtro: FiltroProjetos = {}
): Promise<ProjetoLinha[]> {
  const admin = await createAdminClient()
  let query = admin
    .from("projeto")
    .select(
      "id, descricao_sumaria, tipo, orcamento, inicio, termino_previsao, finalizado, estrategico"
    )
    .eq("emp_proprietaria_id", await tenantAtual())

  const busca = (filtro.busca ?? "").trim()
  if (busca) query = query.ilike("descricao_sumaria", `%${busca}%`)
  if (filtro.tipo) query = query.eq("tipo", filtro.tipo)
  if (filtro.situacao === "andamento") query = query.not("finalizado", "is", true)
  else if (filtro.situacao === "finalizados") query = query.eq("finalizado", true)

  const { data, error } = await query
    .order("inicio", { ascending: false, nullsFirst: false })
    .order("descricao_sumaria", { ascending: true })
  if (error) throw new Error(`Falha ao listar projetos: ${error.message}`)

  const linhas = data ?? []
  const gastos = await gastoPorProjeto(linhas.map((p) => p.id))

  return linhas.map((p) => {
    const g = gastos.get(p.id)
    return {
      id: p.id,
      titulo: texto(p.descricao_sumaria),
      tipo: texto(p.tipo),
      orcamento: numero(p.orcamento),
      inicio: texto(p.inicio),
      termino_previsao: texto(p.termino_previsao),
      finalizado: p.finalizado as boolean | null,
      estrategico: p.estrategico as boolean | null,
      gastoCompras: g?.total ?? 0,
      solicitacoes: g?.solicitacoes ?? 0,
    }
  })
}

// ── Resumo (cards) ──────────────────────────────────────────────────────────

export type ResumoProjetos = {
  total: number
  emAndamento: number
  finalizados: number
  orcamentoAndamento: number
  solicitadoCompras: number
}

export async function resumoProjetos(): Promise<ResumoProjetos> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("projeto")
    .select("id, orcamento, finalizado")
    .eq("emp_proprietaria_id", await tenantAtual())

  const linhas = data ?? []
  const emAndamento = linhas.filter((p) => p.finalizado !== true)
  const gastos = await gastoPorProjeto(linhas.map((p) => p.id))
  let solicitadoCompras = 0
  for (const g of gastos.values()) solicitadoCompras += g.total

  return {
    total: linhas.length,
    emAndamento: emAndamento.length,
    finalizados: linhas.filter((p) => p.finalizado === true).length,
    orcamentoAndamento: emAndamento.reduce(
      (s, p) => s + (numero(p.orcamento) ?? 0),
      0
    ),
    solicitadoCompras,
  }
}

// ── Detalhe ─────────────────────────────────────────────────────────────────

export type SolicitacaoDoProjeto = {
  id: string
  codigo: string | null
  descricao: string | null
  situacao: string | null
  valor: number | null
}

export type DetalheProjeto = {
  id: string
  titulo: string | null
  tipo: string | null
  detalhamento: string | null
  orcamento: number | null
  inicio: string | null
  termino_previsao: string | null
  finalizado: boolean | null
  estrategico: boolean | null
  autorizado: boolean | null
  autorizacaoQuando: string | null
  centroCustoId: string | null
  centroCustoNome: string | null
  departamentos: string[]
  gastoCompras: number
  solicitacoes: SolicitacaoDoProjeto[]
}

export async function obterProjeto(id: string): Promise<DetalheProjeto | null> {
  const admin = await createAdminClient()
  const { data: p } = await admin
    .from("projeto")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!p) return null

  // Centro de custo
  let centroCustoNome: string | null = null
  const centroCustoId = texto(p.centro_custo_id)
  if (centroCustoId) {
    const { data: cc } = await admin
      .from("centros_de_custo")
      .select("nome_da_conta")
      .eq("id", centroCustoId)
      .maybeSingle()
    centroCustoNome = texto(cc?.nome_da_conta)
  }

  // Departamentos (bubble_ids → nome)
  const deptBubbleIds = listaJsonb(p.departamentos_assoc_raw)
  const departamentos: string[] = []
  if (deptBubbleIds.length > 0) {
    const { data: depts } = await admin
      .from("empresa_departamentos")
      .select("departamento, bubble_id")
      .in("bubble_id", deptBubbleIds)
    for (const d of depts ?? []) {
      const nome = texto(d.departamento)
      if (nome) departamentos.push(nome)
    }
  }

  // Solicitações de compra vinculadas (situação derivada das flags, como em Compras)
  const { data: sols } = await admin
    .from("compras_solicitacoes")
    .select(
      "id, codigo, descricao_objetivo, solicitacao_produto, compra_valor, cancelado, recebido, comprado, em_cotacao, cotacao_termino"
    )
    .eq("solicitacao_projeto_id", id)
    .order("compra_valor", { ascending: false, nullsFirst: false })
  const solicitacoes: SolicitacaoDoProjeto[] = (sols ?? []).map((s) => ({
    id: s.id as string,
    codigo: texto(s.codigo),
    descricao: texto(s.descricao_objetivo) ?? texto(s.solicitacao_produto),
    situacao: ROTULOS_SITUACAO_PROCESSO[derivarSituacao(s)],
    valor: numero(s.compra_valor),
  }))
  const gastoCompras = solicitacoes.reduce((sum, s) => sum + (s.valor ?? 0), 0)

  return {
    id: p.id as string,
    titulo: texto(p.descricao_sumaria),
    tipo: texto(p.tipo),
    detalhamento: texto(p.detalhamento),
    orcamento: numero(p.orcamento),
    inicio: texto(p.inicio),
    termino_previsao: texto(p.termino_previsao),
    finalizado: p.finalizado as boolean | null,
    estrategico: p.estrategico as boolean | null,
    autorizado: p.autorizacao_autorizado as boolean | null,
    autorizacaoQuando: texto(p.autorizacao_quando),
    centroCustoId,
    centroCustoNome,
    departamentos,
    gastoCompras,
    solicitacoes,
  }
}

// ── Escrita ─────────────────────────────────────────────────────────────────

export type DadosProjeto = {
  titulo: string
  tipo: string | null
  detalhamento: string | null
  orcamento: number | null
  inicio: string | null
  termino_previsao: string | null
  centro_custo_id: string | null
  estrategico: boolean
}

/** Mapeia os dados do formulário para as colunas reais da tabela `projeto`. */
function paraColunas(dados: DadosProjeto) {
  return {
    descricao_sumaria: dados.titulo,
    tipo: dados.tipo,
    detalhamento: dados.detalhamento,
    orcamento: dados.orcamento,
    inicio: dados.inicio,
    termino_previsao: dados.termino_previsao,
    centro_custo_id: dados.centro_custo_id,
    estrategico: dados.estrategico,
  }
}

export async function criarProjeto(
  dados: DadosProjeto
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("projeto")
    .insert({
      ...paraColunas(dados),
      finalizado: false,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error) return { erro: `Falha ao criar projeto: ${error.message}` }
  return { id: data.id as string }
}

export async function atualizarProjeto(
  id: string,
  dados: DadosProjeto
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("projeto")
    .update({ ...paraColunas(dados), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao salvar projeto: ${error.message}` }
  return {}
}

export async function definirFinalizado(
  id: string,
  finalizado: boolean
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("projeto")
    .update({ finalizado, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao atualizar situação: ${error.message}` }
  return {}
}
