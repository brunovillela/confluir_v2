import "server-only"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { aplicarMovimento } from "@/lib/agenda-calendario"
import { origemDaAgenda, type OrigemAgenda } from "@/lib/agenda-constantes"
import { tenantAtual } from "@/lib/tenant"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Agenda — 654 eventos migrados do Bubble (2024–2026). Dois tipos convivem:
 * "Atividade sindical" (484) e "Equipamento" (106, muitos sem data/título), além
 * de ~64 sem tipo. A tela tem a lista cronológica (mais recentes primeiro, com
 * filtros) e o calendário (mês, semana e dia; regras em lib/agenda-calendario.ts).
 *
 * `agenda_representantes` (participantes) está VAZIA e não veio raw na migração:
 * simplesmente não há dado de participantes. Vínculos `projeto_id`/`assembleia_id`
 * existem no schema mas vieram vazios (0 preenchidos).
 */

async function mapaSedes(): Promise<Map<string, string>> {
  const admin = await createAdminClient()
  const { data } = await admin.from("empresa_sede").select("id, nome")
  return new Map((data ?? []).map((s) => [s.id as string, texto(s.nome) ?? ""]))
}

async function mapaDepartamentos(): Promise<Map<string, string>> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("empresa_departamentos")
    .select("id, departamento")
  return new Map(
    (data ?? []).map((d) => [d.id as string, texto(d.departamento) ?? ""])
  )
}

export { TIPOS_AGENDA } from "@/lib/agenda-constantes"

// ── Listagem ────────────────────────────────────────────────────────────────

export type EventoLinha = {
  id: string
  atividade: string | null
  tipo: string | null
  inicio: string | null
  termino: string | null
  diaTodo: boolean
  local: string | null
  sedeNome: string | null
  departamentoNome: string | null
  /** Avulso (editável na Agenda) ou espelho de Eventos/Votações. */
  origem: OrigemAgenda
  /** Onde se edita o espelho (evento ou rodada da assembleia). */
  linkOrigem: string | null
}

export type FiltroAgenda = {
  busca?: string
  tipo?: string
  sedeId?: string
  quando?: "futuros" | "passados" | "todos"
}

export async function listarEventos(
  filtro: FiltroAgenda = {}
): Promise<EventoLinha[]> {
  const admin = await createAdminClient()
  let query = admin
    .from("agenda")
    .select(
      "id, atividade, tipo, inicio, termino, dia_todo, local, sede_id, departamento_id, evento_id, assembleia_id"
    )
    .eq("emp_proprietaria_id", await tenantAtual())

  const busca = (filtro.busca ?? "").trim()
  if (busca) query = query.ilike("atividade", `%${busca}%`)
  if (filtro.tipo) query = query.eq("tipo", filtro.tipo)
  if (filtro.sedeId) query = query.eq("sede_id", filtro.sedeId)

  const hoje = new Date().toISOString()
  if (filtro.quando === "futuros") query = query.gte("inicio", hoje)
  else if (filtro.quando === "passados") query = query.lt("inicio", hoje)

  const { data, error } = await query
    .order("inicio", { ascending: false, nullsFirst: false })
    .limit(500)
  if (error) throw new Error(`Falha ao listar eventos: ${error.message}`)

  return paraEventoLinhas(data ?? [])
}

/**
 * Compromissos que tocam o período [de, ate) — inclusive os que começaram
 * antes e ainda estão em curso. É o que o calendário mostra.
 */
export async function listarEventosDoPeriodo(
  de: string,
  ate: string,
  filtro: Pick<FiltroAgenda, "busca" | "tipo"> = {}
): Promise<EventoLinha[]> {
  const admin = await createAdminClient()
  let query = admin
    .from("agenda")
    .select(
      "id, atividade, tipo, inicio, termino, dia_todo, local, sede_id, departamento_id, evento_id, assembleia_id"
    )
    .eq("emp_proprietaria_id", await tenantAtual())
    .lt("inicio", ate)
    .or(`inicio.gte."${de}",termino.gte."${de}"`)

  const busca = (filtro.busca ?? "").trim()
  if (busca) query = query.ilike("atividade", `%${busca}%`)
  if (filtro.tipo) query = query.eq("tipo", filtro.tipo)

  const { data, error } = await query.order("inicio", { ascending: true }).limit(1000)
  if (error) throw new Error(`Falha ao listar eventos: ${error.message}`)
  return paraEventoLinhas(data ?? [])
}

async function paraEventoLinhas(linhas: Record<string, unknown>[]): Promise<EventoLinha[]> {
  const [sedes, deptos, rodadas] = await Promise.all([
    mapaSedes(),
    mapaDepartamentos(),
    rodadasDasAssembleias(
      linhas.map((e) => e.assembleia_id as string | null).filter((v): v is string => Boolean(v))
    ),
  ])

  return linhas.map((e) => ({
    id: e.id as string,
    atividade: texto(e.atividade),
    tipo: texto(e.tipo),
    inicio: texto(e.inicio),
    termino: texto(e.termino),
    diaTodo: e.dia_todo === true,
    local: texto(e.local),
    sedeNome: e.sede_id ? (sedes.get(e.sede_id as string) ?? null) : null,
    departamentoNome: e.departamento_id
      ? (deptos.get(e.departamento_id as string) ?? null)
      : null,
    origem: origemDaAgenda(e),
    linkOrigem: linkDaOrigem(e, rodadas),
  }))
}

/** Assembleia → rodada, para o espelho de Votações abrir a rodada certa. */
async function rodadasDasAssembleias(ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_assembleias")
    .select("id, rod_assembleia_id")
    .in("id", [...new Set(ids)])
  return new Map(
    (data ?? [])
      .filter((a) => a.rod_assembleia_id)
      .map((a) => [String(a.id), String(a.rod_assembleia_id)])
  )
}

function linkDaOrigem(
  e: { evento_id?: unknown; assembleia_id?: unknown },
  rodadas: Map<string, string>
): string | null {
  if (e.evento_id) return `/painel/eventos/${e.evento_id}`
  if (e.assembleia_id) {
    const rodada = rodadas.get(String(e.assembleia_id))
    return rodada
      ? `/painel/representacao/votacoes/rodadas/${rodada}`
      : "/painel/representacao/votacoes"
  }
  return null
}

export async function resumoAgenda(): Promise<{
  total: number
  futuros: number
}> {
  const admin = await createAdminClient()
  const hoje = new Date().toISOString()
  const [{ count: total }, { count: futuros }] = await Promise.all([
    admin
      .from("agenda")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", await tenantAtual()),
    admin
      .from("agenda")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", await tenantAtual())
      .gte("inicio", hoje),
  ])
  return { total: total ?? 0, futuros: futuros ?? 0 }
}

// ── Detalhe ─────────────────────────────────────────────────────────────────

export type DetalheEvento = {
  id: string
  atividade: string | null
  tipo: string | null
  inicio: string | null
  termino: string | null
  diaTodo: boolean
  local: string | null
  informacoesGerais: string | null
  eventoInterno: boolean
  aplicativo: boolean
  sedeNome: string | null
  departamentoNome: string | null
  /** Avulso (editável aqui) ou espelho de Eventos/Votações. */
  origem: OrigemAgenda
  eventoId: string | null
  /** Onde se edita o espelho (evento ou rodada da assembleia). */
  linkOrigem: string | null
  /** Campos crus para o formulário de edição. */
  sedeId: string | null
  departamentoId: string | null
}

export async function obterEvento(id: string): Promise<DetalheEvento | null> {
  const admin = await createAdminClient()
  const { data: e } = await admin
    .from("agenda")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!e) return null

  const [sedes, deptos, rodadas] = await Promise.all([
    mapaSedes(),
    mapaDepartamentos(),
    rodadasDasAssembleias(e.assembleia_id ? [String(e.assembleia_id)] : []),
  ])

  return {
    id: e.id as string,
    atividade: texto(e.atividade),
    tipo: texto(e.tipo),
    inicio: texto(e.inicio),
    termino: texto(e.termino),
    diaTodo: e.dia_todo === true,
    local: texto(e.local),
    informacoesGerais: texto(e.informacoes_gerais),
    eventoInterno: e.evento_interno === true,
    aplicativo: e.aplicativo === true,
    sedeNome: e.sede_id ? (sedes.get(e.sede_id as string) ?? null) : null,
    departamentoNome: e.departamento_id
      ? (deptos.get(e.departamento_id as string) ?? null)
      : null,
    origem: origemDaAgenda(e),
    eventoId: texto(e.evento_id),
    linkOrigem: linkDaOrigem(e, rodadas),
    sedeId: texto(e.sede_id),
    departamentoId: texto(e.departamento_id),
  }
}

// ── Compromisso avulso (gravação) ────────────────────────────────────────────

export type DadosCompromisso = {
  atividade: string
  tipo: string
  /** ISO com fuso (já convertido de America/Sao_Paulo). */
  inicio: string
  termino: string | null
  diaTodo: boolean
  local: string | null
  sedeId: string | null
  departamentoId: string | null
  informacoesGerais: string | null
  eventoInterno: boolean
  /** Aparece na agenda do portal do filiado. */
  aplicativo: boolean
}

/** Sedes da entidade, para o formulário. */
export async function sedesParaAgenda(): Promise<{ id: string; nome: string }[]> {
  const sedes = await mapaSedes()
  return [...sedes.entries()]
    .map(([id, nome]) => ({ id, nome: nome || "(sem nome)" }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

/** O compromisso existe, é do tenant e é AVULSO (não espelho de outra área)? */
async function compromissoAvulso(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("agenda")
    .select("id, evento_id, assembleia_id")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!data) return { erro: "Compromisso não encontrado." }
  const origem = origemDaAgenda(data)
  if (origem === "evento") return { erro: "Este compromisso é de um evento — edite-o em Eventos." }
  if (origem === "votacao") return { erro: "Este compromisso é de uma votação — edite-o em Votações." }
  return {}
}

/** Cria (sem `id`) ou atualiza um compromisso avulso. */
export async function salvarCompromisso(
  id: string | null,
  dados: DadosCompromisso,
  usuarioId: string
): Promise<{ erro?: string; id?: string }> {
  if (id) {
    const { erro } = await compromissoAvulso(id)
    if (erro) return { erro }
  }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const linha = {
    atividade: dados.atividade,
    tipo: dados.tipo,
    inicio: dados.inicio,
    termino: dados.termino,
    dia_todo: dados.diaTodo,
    local: dados.local,
    sede_id: dados.sedeId,
    departamento_id: dados.departamentoId,
    informacoes_gerais: dados.informacoesGerais,
    evento_interno: dados.eventoInterno,
    aplicativo: dados.aplicativo,
  }
  // Autoria (supabase/agenda-avulsa.sql); sem as colunas, grava sem ela.
  const autoria = id
    ? { updated_at: new Date().toISOString() }
    : { criado_por: usuarioId }

  const gravar = (comAutoria: boolean) =>
    id
      ? admin
          .from("agenda")
          .update({ ...linha, ...(comAutoria ? autoria : {}) })
          .eq("id", id)
          .eq("emp_proprietaria_id", emp)
          .select("id")
          .single()
      : admin
          .from("agenda")
          .insert({ ...linha, ...(comAutoria ? autoria : {}), emp_proprietaria_id: emp })
          .select("id")
          .single()

  let { data, error } = await gravar(true)
  if (error && esquemaAusente(error)) ({ data, error } = await gravar(false))
  if (error || !data) {
    return { erro: `Não foi possível salvar o compromisso: ${error?.message ?? "?"}` }
  }
  return { id: String(data.id) }
}

/**
 * Muda o compromisso avulso de dia ou horário, mantendo a duração. O término
 * sai do que está gravado agora, não do que a tela tinha ao arrastar.
 */
export async function moverCompromisso(id: string, novoInicio: string): Promise<{ erro?: string }> {
  const { erro } = await compromissoAvulso(id)
  if (erro) return { erro }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("agenda")
    .select("inicio, termino")
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!data) return { erro: "Compromisso não encontrado." }
  const novo = aplicarMovimento({ inicio: texto(data.inicio), termino: texto(data.termino) }, novoInicio)

  const gravar = (comAutoria: boolean) =>
    admin
      .from("agenda")
      .update({ ...novo, ...(comAutoria ? { updated_at: new Date().toISOString() } : {}) })
      .eq("id", id)
      .eq("emp_proprietaria_id", emp)
  let { error } = await gravar(true)
  if (error && esquemaAusente(error)) ({ error } = await gravar(false))
  if (error) return { erro: `Não foi possível mover: ${error.message}` }
  return {}
}

export async function excluirCompromisso(id: string): Promise<{ erro?: string }> {
  const { erro } = await compromissoAvulso(id)
  if (erro) return { erro }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("agenda")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  return {}
}
