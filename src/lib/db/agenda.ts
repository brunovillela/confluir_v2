import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Agenda — 654 eventos migrados do Bubble (2024–2026). Dois tipos convivem:
 * "Atividade sindical" (484) e "Equipamento" (106, muitos sem data/título), além
 * de ~64 sem tipo. Como só há 1 evento futuro, a tela é uma lista cronológica
 * (mais recentes primeiro) com filtros — não um calendário vazio.
 *
 * `agenda_representantes` (participantes) está VAZIA e não veio raw na migração:
 * simplesmente não há dado de participantes. Vínculos `projeto_id`/`assembleia_id`
 * existem no schema mas vieram vazios (0 preenchidos).
 */

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null
}

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

export const TIPOS_AGENDA = ["Atividade sindical", "Equipamento"] as const

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
      "id, atividade, tipo, inicio, termino, dia_todo, local, sede_id, departamento_id"
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

  const linhas = data ?? []
  const [sedes, deptos] = await Promise.all([
    mapaSedes(),
    mapaDepartamentos(),
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
  }))
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

  const [sedes, deptos] = await Promise.all([
    mapaSedes(),
    mapaDepartamentos(),
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
  }
}
