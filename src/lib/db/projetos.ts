import "server-only"
import { esquemaAusente, hojeSP, lerEmLotesPorIds, texto } from "@/lib/db/comum"
import { situacaoDoProjeto, type NivelProjeto } from "@/lib/projetos-constantes"
import { tenantAtual } from "@/lib/tenant"

import { derivarSituacao } from "@/lib/db/compras"
import { ROTULOS_SITUACAO_PROCESSO } from "@/lib/compras-constantes"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Projetos — tabela `projeto` (101 registros migrados do Bubble). É a dimensão
 * orçamentária que amarra Compras (`compras_solicitacoes.solicitacao_projeto_id`),
 * ordens de pagamento (`ordens_pagamento.projeto_id`) e reembolsos
 * (`filiacao_reembolsos.projeto_id`). O gasto exibido vem das ordens — ver
 * gastosDosProjetos (`ordens_pagamento_raw` do legado veio vazio e não é usado).
 *
 * Convenções da tabela:
 * • `descricao_sumaria` = título do projeto (o campo `descricao` veio sempre nulo).
 * • `detalhamento` = texto longo.
 * • `tipo` ∈ TIPOS_PROJETO (sempre preenchido).
 * • `finalizado` deriva a situação; `estrategico` existe mas nunca foi usado.
 * • `departamentos_assoc_raw` = array de bubble_ids de `empresa_departamentos`.
 */

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

// ── Gasto por projeto (ordens, compras e reembolsos) ─────────────────────────

/**
 * GASTO REAL DO PROJETO (25/11/2026). Antes, só a soma das compras: as ordens
 * de pagamento e os reembolsos ligados ao projeto (60 e 44 desde a virada)
 * não apareciam, e a compra cancelada contava. Agora o gasto são as ORDENS:
 * a que tem o projeto, a que nasceu de uma compra do projeto e a de um
 * reembolso do projeto — cada uma uma vez só (a ordem de compra nova não
 * leva o projeto: 14 de 98 desde a virada). Cancelada, estornada ou excluída
 * não conta. A compra (ou o reembolso) do projeto ainda sem ordem entra como
 * comprometido.
 */
export type GastoProjeto = {
  /** Ordens pagas. */
  pago: number
  /** Ordens ainda não pagas (em autorização, a pagar, aguardando documento…). */
  aPagar: number
  /** Compras e reembolsos do projeto que ainda não viraram ordem. */
  comprometido: number
  /** pago + aPagar + comprometido. */
  total: number
  ordens: number
  /** Reembolsos a filiados: só a soma (o detalhe fica em Reembolsos). */
  reembolsos: { quantidade: number; total: number }
  solicitacoes: number
}

export type OrdemDoProjeto = {
  id: string
  codigo: string | null
  descricao: string | null
  situacao: string | null
  valor: number
  data: string | null
  origem: "projeto" | "compra"
  /** Lançada direto no projeto (não pela compra dele): transfere-se sozinha. */
  transferivel: boolean
}

const SITUACOES_FORA_DO_GASTO = new Set(["Cancelada", "Estornado"])

function gastoVazio(): GastoProjeto {
  return { pago: 0, aPagar: 0, comprometido: 0, total: 0, ordens: 0, reembolsos: { quantidade: 0, total: 0 }, solicitacoes: 0 }
}

function valorDaOrdem(o: Record<string, unknown>): number {
  return Number(o.valor_pago ?? o.valor_inicial_cobranca ?? o.valor ?? 0) || 0
}

function contaNoGasto(o: Record<string, unknown>): boolean {
  return o.excluido !== true && !SITUACOES_FORA_DO_GASTO.has(String(o.situacao ?? ""))
}

async function gastosDosProjetos(
  projetoIds: string[]
): Promise<{ gastos: Map<string, GastoProjeto>; ordens: Map<string, OrdemDoProjeto[]> }> {
  const gastos = new Map<string, GastoProjeto>()
  const ordensPorProjeto = new Map<string, OrdemDoProjeto[]>()
  const ids = [...new Set(projetoIds.filter(Boolean))]
  if (ids.length === 0) return { gastos, ordens: ordensPorProjeto }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const COLUNAS_ORDEM =
    "id, codigo, descricao, situacao, excluido, tipo, valor, valor_pago, valor_inicial_cobranca, vencimento, data_pagamento, projeto_id, processo_compra_id"

  const [compras, reembolsos, ordensDiretas] = await Promise.all([
    lerEmLotesPorIds(ids, (fatia, de, ate) =>
      admin
        .from("compras_solicitacoes")
        .select("id, solicitacao_projeto_id, compra_valor, cancelado")
        .eq("emp_proprietaria_id", emp)
        .in("solicitacao_projeto_id", fatia)
        .order("id")
        .range(de, ate)
    ),
    lerEmLotesPorIds(ids, (fatia, de, ate) =>
      admin
        .from("filiacao_reembolsos")
        .select("id, projeto_id, ordem_pagamento_id, valor")
        .eq("emp_proprietaria_id", emp)
        .in("projeto_id", fatia)
        .order("id")
        .range(de, ate)
    ),
    lerEmLotesPorIds(ids, (fatia, de, ate) =>
      admin.from("ordens_pagamento").select(COLUNAS_ORDEM).eq("emp_proprietaria_id", emp).in("projeto_id", fatia).order("id").range(de, ate)
    ),
  ])

  const projetoDaCompra = new Map(compras.map((c) => [String(c.id), String(c.solicitacao_projeto_id)]))
  const ordens = new Map<string, Record<string, unknown>>(ordensDiretas.map((o) => [String(o.id), o]))
  const dasCompras = await lerEmLotesPorIds([...projetoDaCompra.keys()], (fatia, de, ate) =>
    admin.from("ordens_pagamento").select(COLUNAS_ORDEM).eq("emp_proprietaria_id", emp).in("processo_compra_id", fatia).order("id").range(de, ate)
  )
  for (const o of dasCompras) ordens.set(String(o.id), o)
  const faltam = reembolsos.map((r) => texto(r.ordem_pagamento_id)).filter((v): v is string => !!v && !ordens.has(v))
  const dosReembolsos = await lerEmLotesPorIds(faltam, (fatia, de, ate) =>
    admin.from("ordens_pagamento").select(COLUNAS_ORDEM).eq("emp_proprietaria_id", emp).in("id", fatia).order("id").range(de, ate)
  )
  for (const o of dosReembolsos) ordens.set(String(o.id), o)

  const projetoDoReembolsoPorOrdem = new Map<string, string>()
  for (const r of reembolsos) {
    const oid = texto(r.ordem_pagamento_id)
    if (oid) projetoDoReembolsoPorOrdem.set(oid, String(r.projeto_id))
  }
  const doProjeto = (pid: string) => {
    let g = gastos.get(pid)
    if (!g) gastos.set(pid, (g = gastoVazio()))
    return g
  }

  // Ordens: o projeto da própria ordem; senão, o da compra ou o do reembolso.
  const comprasComOrdem = new Set<string>()
  for (const o of ordens.values()) {
    const id = String(o.id)
    const compra = texto(o.processo_compra_id)
    const pid = texto(o.projeto_id) ?? (compra ? projetoDaCompra.get(compra) : undefined) ?? projetoDoReembolsoPorOrdem.get(id)
    // A compra que já teve ordem sai do comprometido, mesmo com a ordem
    // cancelada (a compra refeita ganha outra ordem; não conta duas vezes) ou
    // levada para outro projeto.
    if (compra) comprasComOrdem.add(compra)
    if (!pid || !ids.includes(pid)) continue
    if (!contaNoGasto(o)) continue
    const g = doProjeto(pid)
    const valor = valorDaOrdem(o)
    if (o.situacao === "Paga") g.pago += valor
    else g.aPagar += valor
    g.ordens += 1
    const ehReembolso = projetoDoReembolsoPorOrdem.has(id) || o.tipo === "Reembolso"
    if (ehReembolso) {
      g.reembolsos.quantidade += 1
      g.reembolsos.total += valor
      continue
    }
    const lista = ordensPorProjeto.get(pid) ?? []
    lista.push({
      id,
      codigo: texto(o.codigo),
      descricao: texto(o.descricao),
      situacao: texto(o.situacao),
      valor,
      data: texto(o.data_pagamento) ?? texto(o.vencimento),
      origem: compra && !texto(o.projeto_id) ? "compra" : "projeto",
      transferivel: texto(o.projeto_id) === pid && !(compra && projetoDaCompra.get(compra) === pid),
    })
    ordensPorProjeto.set(pid, lista)
  }

  // Compras sem nenhuma ordem e reembolsos sem ordem: comprometido.
  for (const c of compras) {
    const pid = String(c.solicitacao_projeto_id)
    const g = doProjeto(pid)
    g.solicitacoes += 1
    if (c.cancelado === true || comprasComOrdem.has(String(c.id))) continue
    g.comprometido += numero(c.compra_valor) ?? 0
  }
  for (const r of reembolsos) {
    if (texto(r.ordem_pagamento_id)) continue
    const g = doProjeto(String(r.projeto_id))
    const valor = Number(r.valor ?? 0) || 0
    g.comprometido += valor
    g.reembolsos.quantidade += 1
    g.reembolsos.total += valor
  }

  for (const g of gastos.values()) {
    g.pago = Math.round(g.pago * 100) / 100
    g.aPagar = Math.round(g.aPagar * 100) / 100
    g.comprometido = Math.round(g.comprometido * 100) / 100
    g.reembolsos.total = Math.round(g.reembolsos.total * 100) / 100
    g.total = Math.round((g.pago + g.aPagar + g.comprometido) * 100) / 100
  }
  for (const lista of ordensPorProjeto.values()) lista.sort((a, b) => (b.data ?? "").localeCompare(a.data ?? ""))
  return { gastos, ordens: ordensPorProjeto }
}

// ── Marcos e tarefas por projeto (carteira) ──────────────────────────────────

export type MarcoProjeto = {
  id: string
  titulo: string
  dataPrevista: string
  concluidoEm: string | null
}

function paraMarco(m: Record<string, unknown>): MarcoProjeto {
  return {
    id: String(m.id),
    titulo: texto(m.titulo) ?? "(sem título)",
    dataPrevista: String(m.data_prevista),
    concluidoEm: texto(m.concluido_em),
  }
}

/** Marcos de vários projetos, por data. Sem a tabela (antes da migração), nenhum. */
async function marcosPorProjeto(projetoIds: string[]): Promise<Map<string, MarcoProjeto[]>> {
  const mapa = new Map<string, MarcoProjeto[]>()
  if (projetoIds.length === 0) return mapa
  const admin = await createAdminClient()
  try {
    const linhas = await lerEmLotesPorIds(projetoIds, (fatia, de, ate) =>
      admin
        .from("projeto_marcos")
        .select("id, projeto_id, titulo, data_prevista, concluido_em")
        .in("projeto_id", fatia)
        .order("data_prevista")
        .order("id")
        .range(de, ate)
    )
    for (const m of linhas) {
      const pid = String(m.projeto_id)
      mapa.set(pid, [...(mapa.get(pid) ?? []), paraMarco(m)])
    }
  } catch (e) {
    if (!esquemaAusente(e as { code?: string })) throw e
  }
  return mapa
}

export type TarefasDoProjeto = { total: number; concluidas: number; atrasadas: number }

/**
 * Tarefas de cada projeto: as que têm o projeto e as que entraram direto na
 * demanda do projeto (o mesmo critério da página do projeto), sem repetir.
 */
async function tarefasPorProjeto(projetoIds: string[]): Promise<Map<string, TarefasDoProjeto>> {
  const mapa = new Map<string, TarefasDoProjeto>()
  if (projetoIds.length === 0) return mapa
  const admin = await createAdminClient()
  const hoje = hojeSP()
  try {
    const demandas = await lerEmLotesPorIds(projetoIds, (fatia, de, ate) =>
      admin.from("demandas").select("id, projeto_id").in("projeto_id", fatia).order("id").range(de, ate)
    )
    const projetoDaDemanda = new Map(demandas.map((d) => [String(d.id), String(d.projeto_id)]))
    const colunas = "id, projeto_id, demanda_id, concluido, data_prazo_entrega"
    const [doProjeto, daDemanda] = await Promise.all([
      lerEmLotesPorIds(projetoIds, (fatia, de, ate) =>
        admin.from("demandas_check_tarefas").select(colunas).in("projeto_id", fatia).order("id").range(de, ate)
      ),
      lerEmLotesPorIds([...projetoDaDemanda.keys()], (fatia, de, ate) =>
        admin.from("demandas_check_tarefas").select(colunas).in("demanda_id", fatia).order("id").range(de, ate)
      ),
    ])
    const vistas = new Set<string>()
    for (const t of [...doProjeto, ...daDemanda]) {
      const id = String(t.id)
      if (vistas.has(id)) continue
      vistas.add(id)
      const pid = texto(t.projeto_id) ?? projetoDaDemanda.get(String(t.demanda_id))
      if (!pid) continue
      const atual = mapa.get(pid) ?? { total: 0, concluidas: 0, atrasadas: 0 }
      atual.total += 1
      if (t.concluido === true) atual.concluidas += 1
      else if (texto(t.data_prazo_entrega) && String(t.data_prazo_entrega) < hoje) atual.atrasadas += 1
      mapa.set(pid, atual)
    }
  } catch (e) {
    if (!esquemaAusente(e as { code?: string })) throw e
  }
  return mapa
}

/** Os marcos de um projeto, por data (página do projeto). */
export async function listarMarcos(projetoId: string): Promise<MarcoProjeto[]> {
  return (await marcosPorProjeto([projetoId])).get(projetoId) ?? []
}

async function marcoDoTenant(id: string) {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("projeto_marcos")
    .select("id, projeto_id")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return data ? { admin, projetoId: String(data.projeto_id) } : null
}

export async function criarMarco(
  projetoId: string,
  dados: { titulo: string; dataPrevista: string }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: projeto } = await admin.from("projeto").select("id").eq("id", projetoId).eq("emp_proprietaria_id", emp).maybeSingle()
  if (!projeto) return { erro: "Projeto não encontrado." }
  const { error } = await admin.from("projeto_marcos").insert({
    emp_proprietaria_id: emp,
    projeto_id: projetoId,
    titulo: dados.titulo,
    data_prevista: dados.dataPrevista,
  })
  if (error) return { erro: `Falha ao criar o marco: ${error.message}` }
  return {}
}

export async function editarMarco(
  id: string,
  dados: { titulo: string; dataPrevista: string }
): Promise<{ erro?: string; projetoId?: string }> {
  const m = await marcoDoTenant(id)
  if (!m) return { erro: "Marco não encontrado." }
  const { error } = await m.admin
    .from("projeto_marcos")
    .update({ titulo: dados.titulo, data_prevista: dados.dataPrevista, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { erro: `Falha ao salvar o marco: ${error.message}` }
  return { projetoId: m.projetoId }
}

/** Dá o marco por cumprido (hoje) ou o reabre. */
export async function definirMarcoConcluido(id: string, concluido: boolean): Promise<{ erro?: string; projetoId?: string }> {
  const m = await marcoDoTenant(id)
  if (!m) return { erro: "Marco não encontrado." }
  const { error } = await m.admin
    .from("projeto_marcos")
    .update({ concluido_em: concluido ? hojeSP() : null, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { erro: `Falha ao atualizar o marco: ${error.message}` }
  return { projetoId: m.projetoId }
}

export async function excluirMarco(id: string): Promise<{ erro?: string; projetoId?: string }> {
  const m = await marcoDoTenant(id)
  if (!m) return { erro: "Marco não encontrado." }
  const { error } = await m.admin.from("projeto_marcos").delete().eq("id", id)
  if (error) return { erro: `Falha ao excluir o marco: ${error.message}` }
  return { projetoId: m.projetoId }
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
  gasto: GastoProjeto
  tarefas: TarefasDoProjeto
  /** O próximo marco em aberto (o de data mais próxima, mesmo vencido). */
  proximoMarco: MarcoProjeto | null
  marcos: { total: number; concluidos: number }
  situacao: { nivel: NivelProjeto; motivos: string[] }
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
  const ids = linhas.map((p) => p.id as string)
  const [{ gastos }, marcos, tarefas] = await Promise.all([gastosDosProjetos(ids), marcosPorProjeto(ids), tarefasPorProjeto(ids)])
  const hoje = hojeSP()

  return linhas.map((p) => {
    const g = gastos.get(p.id) ?? gastoVazio()
    const ms = marcos.get(p.id) ?? []
    const ts = tarefas.get(p.id) ?? { total: 0, concluidas: 0, atrasadas: 0 }
    const orcamento = numero(p.orcamento)
    const gasto = g.total
    return {
      id: p.id,
      titulo: texto(p.descricao_sumaria),
      tipo: texto(p.tipo),
      orcamento: numero(p.orcamento),
      inicio: texto(p.inicio),
      termino_previsao: texto(p.termino_previsao),
      finalizado: p.finalizado as boolean | null,
      estrategico: p.estrategico as boolean | null,
      gasto: g,
      tarefas: ts,
      proximoMarco: ms.find((m) => !m.concluidoEm) ?? null,
      marcos: { total: ms.length, concluidos: ms.filter((m) => m.concluidoEm).length },
      situacao: situacaoDoProjeto(
        {
          finalizado: p.finalizado === true,
          terminoPrevisao: texto(p.termino_previsao),
          marcos: ms.map((m) => ({ titulo: m.titulo, dataPrevista: m.dataPrevista, concluido: Boolean(m.concluidoEm) })),
          tarefasAtrasadas: ts.atrasadas,
          saldo: orcamento != null ? orcamento - gasto : null,
        },
        hoje
      ),
    }
  })
}

// ── Resumo (cards) ──────────────────────────────────────────────────────────

export type ResumoProjetos = {
  total: number
  emAndamento: number
  finalizados: number
  orcamentoAndamento: number
  /** Gasto (pago, a pagar e comprometido) dos projetos em andamento. */
  gastoAndamento: number
}

export async function resumoProjetos(): Promise<ResumoProjetos> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("projeto")
    .select("id, orcamento, finalizado")
    .eq("emp_proprietaria_id", await tenantAtual())

  const linhas = data ?? []
  const emAndamento = linhas.filter((p) => p.finalizado !== true)
  const { gastos } = await gastosDosProjetos(emAndamento.map((p) => p.id))
  let gastoAndamento = 0
  for (const g of gastos.values()) gastoAndamento += g.total

  return {
    total: linhas.length,
    emAndamento: emAndamento.length,
    finalizados: linhas.filter((p) => p.finalizado === true).length,
    orcamentoAndamento: emAndamento.reduce(
      (s, p) => s + (numero(p.orcamento) ?? 0),
      0
    ),
    gastoAndamento: Math.round(gastoAndamento * 100) / 100,
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
  gasto: GastoProjeto
  /** Ordens de pagamento do projeto (sem as de reembolso, que entram só somadas). */
  ordens: OrdemDoProjeto[]
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

  // Solicitações de compra vinculadas (situação derivada das flags, como em Aquisição)
  const { data: sols } = await admin
    .from("compras_solicitacoes")
    .select(
      "id, codigo, descricao_objetivo, solicitacao_produto, compra_valor, cancelado, recebido, comprado, em_cotacao, cotacao_termino"
    )
    .eq("solicitacao_projeto_id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("compra_valor", { ascending: false, nullsFirst: false })
  const solicitacoes: SolicitacaoDoProjeto[] = (sols ?? []).map((s) => ({
    id: s.id as string,
    codigo: texto(s.codigo),
    descricao: texto(s.descricao_objetivo) ?? texto(s.solicitacao_produto),
    situacao: ROTULOS_SITUACAO_PROCESSO[derivarSituacao(s)],
    valor: numero(s.compra_valor),
  }))
  const { gastos, ordens } = await gastosDosProjetos([id])

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
    gasto: gastos.get(id) ?? gastoVazio(),
    ordens: ordens.get(id) ?? [],
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

/** Marcos com data prevista no período (calendário de prazos), com o projeto. */
export async function marcosNoPeriodo(
  de: string,
  ate: string
): Promise<(MarcoProjeto & { projetoId: string; projetoTitulo: string | null; projetoFinalizado: boolean })[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("projeto_marcos")
    .select("id, projeto_id, titulo, data_prevista, concluido_em, projeto:projeto_id (descricao_sumaria, finalizado)")
    .eq("emp_proprietaria_id", await tenantAtual())
    .gte("data_prevista", de)
    .lte("data_prevista", ate)
    .order("data_prevista")
    .limit(1000)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler os marcos: ${error.message}`)
  }
  return (data ?? []).map((m) => {
    const p = (Array.isArray(m.projeto) ? m.projeto[0] : m.projeto) as { descricao_sumaria?: string | null; finalizado?: boolean | null } | null
    return {
      ...paraMarco(m as Record<string, unknown>),
      projetoId: String(m.projeto_id),
      projetoTitulo: texto(p?.descricao_sumaria),
      projetoFinalizado: p?.finalizado === true,
    }
  })
}

// ── Transferência de despesa entre projetos ─────────────────────────────────

/**
 * TRANSFERÊNCIA DE DESPESA (25/11/2026). A despesa lançada no projeto errado
 * passa para outro projeto em andamento: a COMPRA (com as ordens dela) ou a
 * ORDEM lançada direto no projeto. Os dois projetos precisam estar abertos e
 * o motivo é obrigatório. O centro de custo não muda (reclassificar é do
 * Financeiro). Fica no livro `financeiro_transferencias_projeto` e na trilha
 * de cada ordem movida. Reembolso a filiado não se transfere por aqui: ele é
 * mostrado só somado, sem os nomes.
 */
export type TipoTransferencia = "compra" | "ordem"

export type TransferenciaProjeto = {
  id: string
  sentido: "saiu" | "entrou"
  outroProjetoId: string
  outroProjeto: string
  tipo: TipoTransferencia
  descricao: string | null
  valor: number
  motivo: string
  quem: string | null
  quando: string
}

/** Projetos em andamento para onde a despesa pode ir (menos o próprio). */
export async function projetosAbertosParaTransferencia(excetoId: string): Promise<{ id: string; titulo: string }[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("projeto")
    .select("id, descricao_sumaria")
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("finalizado", "is", true)
    .neq("id", excetoId)
    .order("descricao_sumaria")
  return (data ?? []).map((p) => ({ id: String(p.id), titulo: texto(p.descricao_sumaria) ?? "(sem título)" }))
}

export async function transferirDespesa(params: {
  origemId: string
  destinoId: string
  tipo: TipoTransferencia
  itemId: string
  motivo: string
  usuarioId: string
}): Promise<{ erro?: string; ok?: string }> {
  const { origemId, destinoId, tipo, itemId, usuarioId } = params
  const motivo = params.motivo.trim()
  if (!destinoId) return { erro: "Escolha o projeto para onde vai a despesa." }
  if (destinoId === origemId) return { erro: "Escolha outro projeto." }
  if (motivo.length < 3) return { erro: "Escreva o motivo da transferência." }
  if (motivo.length > 500) return { erro: "O motivo passa de 500 caracteres." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: projs } = await admin
    .from("projeto")
    .select("id, descricao_sumaria, finalizado")
    .eq("emp_proprietaria_id", emp)
    .in("id", [origemId, destinoId])
  const origem = (projs ?? []).find((p) => p.id === origemId)
  const destino = (projs ?? []).find((p) => p.id === destinoId)
  if (!origem || !destino) return { erro: "Projeto não encontrado." }
  if (origem.finalizado === true || destino.finalizado === true) {
    return { erro: "Os dois projetos precisam estar em andamento: reabra o finalizado para transferir." }
  }
  const nomeOrigem = texto(origem.descricao_sumaria) ?? "(sem título)"
  const nomeDestino = texto(destino.descricao_sumaria) ?? "(sem título)"

  const COLUNAS =
    "id, codigo, descricao, situacao, excluido, tipo, valor, valor_pago, valor_inicial_cobranca, projeto_id, processo_compra_id"
  let descricao: string | null = null
  let ordensMovidas: Record<string, unknown>[] = []
  let valor = 0
  let compraId: string | null = null
  let ordemId: string | null = null

  if (tipo === "compra") {
    const { data: c } = await admin
      .from("compras_solicitacoes")
      .select("id, codigo, descricao_objetivo, solicitacao_produto, compra_valor, cancelado, solicitacao_projeto_id")
      .eq("emp_proprietaria_id", emp)
      .eq("id", itemId)
      .maybeSingle()
    if (!c || c.solicitacao_projeto_id !== origemId) {
      return { erro: "Esta compra não está mais neste projeto — recarregue a página." }
    }
    compraId = String(c.id)
    descricao = [texto(c.codigo), texto(c.descricao_objetivo) ?? texto(c.solicitacao_produto)].filter(Boolean).join(" — ") || null
    const { data: ords } = await admin
      .from("ordens_pagamento")
      .select(COLUNAS)
      .eq("emp_proprietaria_id", emp)
      .eq("processo_compra_id", compraId)
    const todas = (ords ?? []) as Record<string, unknown>[]
    // As ordens da compra seguem a compra; a que aponta para OUTRO projeto fica onde está.
    ordensMovidas = todas.filter((o) => !texto(o.projeto_id) || o.projeto_id === origemId)
    valor = todas.length
      ? ordensMovidas.filter(contaNoGasto).reduce((s, o) => s + valorDaOrdem(o), 0)
      : c.cancelado === true
        ? 0
        : (numero(c.compra_valor) ?? 0)
  } else {
    const { data: o } = await admin
      .from("ordens_pagamento")
      .select(COLUNAS)
      .eq("emp_proprietaria_id", emp)
      .eq("id", itemId)
      .maybeSingle()
    if (!o || o.projeto_id !== origemId) return { erro: "Esta ordem não está mais neste projeto — recarregue a página." }
    if (o.tipo === "Reembolso") return { erro: "Ordem de reembolso a filiado não se transfere por aqui." }
    const compra = texto(o.processo_compra_id)
    if (compra) {
      const { data: c } = await admin
        .from("compras_solicitacoes")
        .select("codigo, solicitacao_projeto_id")
        .eq("emp_proprietaria_id", emp)
        .eq("id", compra)
        .maybeSingle()
      if (c?.solicitacao_projeto_id === origemId) {
        const codigo = texto(c.codigo)
        return {
          erro: `Esta ordem é da compra ${codigo ? `${codigo} ` : ""}do projeto: transfira a compra, que leva as ordens dela junto.`,
        }
      }
    }
    const linha = o as Record<string, unknown>
    ordemId = String(o.id)
    descricao = [texto(o.codigo), texto(o.descricao)].filter(Boolean).join(" — ") || null
    ordensMovidas = [linha]
    valor = contaNoGasto(linha) ? valorDaOrdem(linha) : 0
  }
  valor = Math.round(valor * 100) / 100

  // Livro primeiro: sem ele (tabela ausente), nada muda.
  const { data: livro, error: erroLivro } = await admin
    .from("financeiro_transferencias_projeto")
    .insert({
      emp_proprietaria_id: emp,
      origem_id: origemId,
      destino_id: destinoId,
      tipo,
      compra_id: compraId,
      ordem_id: ordemId,
      descricao: descricao?.slice(0, 500) ?? null,
      valor,
      ordens: ordensMovidas.length,
      motivo,
      usuario_id: usuarioId,
    })
    .select("id")
    .single()
  if (erroLivro || !livro) {
    return { erro: `Não foi possível registrar a transferência: ${erroLivro?.message ?? "sem resposta"}` }
  }
  const desfazerLivro = () => admin.from("financeiro_transferencias_projeto").delete().eq("id", livro.id)

  if (compraId) {
    const { data: movida, error } = await admin
      .from("compras_solicitacoes")
      .update({ solicitacao_projeto_id: destinoId })
      .eq("emp_proprietaria_id", emp)
      .eq("id", compraId)
      .eq("solicitacao_projeto_id", origemId)
      .select("id")
    if (error || !movida?.length) {
      await desfazerLivro()
      return {
        erro: error
          ? `Não foi possível transferir: ${error.message}`
          : "A compra mudou enquanto você transferia — recarregue a página.",
      }
    }
  }
  const comProjeto = ordensMovidas.filter((o) => o.projeto_id === origemId).map((o) => String(o.id))
  if (comProjeto.length) {
    const { error } = await admin
      .from("ordens_pagamento")
      .update({ projeto_id: destinoId })
      .eq("emp_proprietaria_id", emp)
      .in("id", comProjeto)
      .eq("projeto_id", origemId)
    if (error) {
      if (compraId) {
        await admin
          .from("compras_solicitacoes")
          .update({ solicitacao_projeto_id: origemId })
          .eq("emp_proprietaria_id", emp)
          .eq("id", compraId)
      }
      await desfazerLivro()
      return { erro: `Não foi possível transferir: ${error.message}` }
    }
  }

  if (ordensMovidas.length) {
    const { registrarEvento } = await import("@/lib/db/ordens-ciclo")
    await registrarEvento(
      ordensMovidas.map((o) => String(o.id)),
      "projeto_transferido",
      usuarioId,
      `Do projeto "${nomeOrigem}" para "${nomeDestino}". Motivo: ${motivo}`,
      { de: origemId, para: destinoId, motivo, transferencia_id: livro.id }
    )
  }
  const oQue = tipo === "compra" ? "A compra" : "A ordem"
  const junto =
    tipo === "compra" && ordensMovidas.length
      ? ` (com ${ordensMovidas.length === 1 ? "a ordem dela" : `as ${ordensMovidas.length} ordens dela`})`
      : ""
  return { ok: `${oQue}${junto} foi para o projeto "${nomeDestino}".` }
}

/** O livro de transferências do projeto: o que saiu e o que entrou. */
export async function listarTransferencias(projetoId: string): Promise<TransferenciaProjeto[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("financeiro_transferencias_projeto")
    .select("id, origem_id, destino_id, tipo, descricao, valor, motivo, usuario_id, created_at")
    .eq("emp_proprietaria_id", emp)
    .or(`origem_id.eq.${projetoId},destino_id.eq.${projetoId}`)
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler as transferências: ${error.message}`)
  }
  const linhas = data ?? []
  if (!linhas.length) return []
  const outros = [...new Set(linhas.map((l) => String(l.origem_id === projetoId ? l.destino_id : l.origem_id)))]
  const pessoas = [...new Set(linhas.map((l) => texto(l.usuario_id)).filter((v): v is string => !!v))]
  const [{ data: ps }, { data: us }] = await Promise.all([
    admin.from("projeto").select("id, descricao_sumaria").eq("emp_proprietaria_id", emp).in("id", outros),
    pessoas.length
      ? admin.from("usuarios").select("id, nome_guerra, nome_completo").in("id", pessoas)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])
  const nomeProjeto = new Map((ps ?? []).map((p) => [String(p.id), texto(p.descricao_sumaria) ?? "(sem título)"]))
  const nomePessoa = new Map(
    ((us ?? []) as Record<string, unknown>[]).map((u) => [String(u.id), texto(u.nome_guerra) ?? texto(u.nome_completo)])
  )
  return linhas.map((l) => {
    const saiu = l.origem_id === projetoId
    const outro = String(saiu ? l.destino_id : l.origem_id)
    return {
      id: String(l.id),
      sentido: saiu ? "saiu" : "entrou",
      outroProjetoId: outro,
      outroProjeto: nomeProjeto.get(outro) ?? "(projeto)",
      tipo: l.tipo === "ordem" ? "ordem" : "compra",
      descricao: texto(l.descricao),
      valor: Number(l.valor ?? 0) || 0,
      motivo: String(l.motivo ?? ""),
      quem: texto(l.usuario_id) ? (nomePessoa.get(String(l.usuario_id)) ?? null) : null,
      quando: String(l.created_at),
    }
  })
}
