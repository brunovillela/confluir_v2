import "server-only"
import { tenantAtual } from "@/lib/tenant"

import {
  derivarSituacaoTarefa,
  type SituacaoDemanda,
  type SituacaoTarefa,
} from "@/lib/nucleo-constantes"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Núcleo de ferramentas — Demandas · Tarefas · Anomalias. Os três ficam num
 * arquivo só porque compartilham a espinha: a Tarefa aponta (opcionalmente)
 * para uma Demanda, um Projeto ou uma Anomalia. Ver a reforma em
 * `supabase/nucleo-ferramentas.sql`.
 *
 * A Tarefa depende de colunas novas (`demanda_id`, `titulo`); enquanto o SQL
 * não roda, as funções de Tarefa degradam com `disponivel: false`.
 */

const AVISO_SQL =
  "Núcleo ainda não configurado — rode supabase/nucleo-ferramentas.sql no Supabase."

/** PGRST205/42P01 = tabela ausente; PGRST204/42703 = coluna ausente. */
function esquemaAusente(erro: { code?: string } | null): boolean {
  return ["PGRST205", "42P01", "PGRST204", "42703"].includes(erro?.code ?? "")
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null
}

function numero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── Pessoas ─────────────────────────────────────────────────────────────────

async function nomesDosUsuarios(ids: string[]): Promise<Map<string, string>> {
  const nomes = new Map<string, string>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return nomes
  const admin = await createAdminClient()
  const { data } = await admin
    .from("usuarios")
    .select("id, nome_completo, nome_guerra")
    .in("id", unicos)
  for (const u of data ?? []) {
    const nome = [u.nome_guerra, u.nome_completo].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    )
    if (nome) nomes.set(u.id as string, nome)
  }
  return nomes
}

export type OpcaoPessoa = { id: string; nome: string }

/**
 * Pessoas atribuíveis (responsável, demandante, demandado): operadores do
 * sistema (`permissoes`) + coordenadores de departamento. Conjunto pequeno de
 * lideranças reais — cresce conforme os funcionários forem integrados ao painel.
 * `incluir` garante que ids já referenciados apareçam mesmo fora do conjunto.
 */
export async function listarPessoasAtribuiveis(
  incluir: string[] = []
): Promise<OpcaoPessoa[]> {
  const admin = await createAdminClient()
  const [{ data: perms }, { data: deptos }] = await Promise.all([
    admin.from("permissoes").select("usuario_id"),
    admin.from("empresa_departamentos").select("coordenador_id"),
  ])
  const ids = new Set<string>(incluir.filter(Boolean))
  for (const p of perms ?? []) if (p.usuario_id) ids.add(p.usuario_id as string)
  for (const d of deptos ?? [])
    if (d.coordenador_id) ids.add(d.coordenador_id as string)

  const nomes = await nomesDosUsuarios([...ids])
  return [...nomes.entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

// ════════════════════════════════════════════════════════════════════════════
// DEMANDAS
// ════════════════════════════════════════════════════════════════════════════

export type DemandaLinha = {
  id: string
  nome: string | null
  situacao: string | null
  prazo: string | null
  orcamento: number | null
  responsavelNome: string | null
  tarefasTotal: number
  tarefasConcluidas: number
}

export async function listarDemandas(filtro: {
  busca?: string
  situacao?: string
} = {}): Promise<DemandaLinha[]> {
  const admin = await createAdminClient()
  let query = admin
    .from("demandas")
    .select("id, nome, situacao, prazo, orcamento, membro_responsavel_id")
    .eq("emp_proprietaria_id", await tenantAtual())

  const busca = (filtro.busca ?? "").trim()
  if (busca) query = query.ilike("nome", `%${busca}%`)
  if (filtro.situacao) query = query.eq("situacao", filtro.situacao)

  const { data, error } = await query
    .order("prazo", { ascending: true, nullsFirst: false })
    .order("nome", { ascending: true })
  if (error) throw new Error(`Falha ao listar demandas: ${error.message}`)

  const linhas = data ?? []
  const responsaveis = await nomesDosUsuarios(
    linhas.map((d) => d.membro_responsavel_id as string).filter(Boolean)
  )
  const contagem = await contarTarefasPorPai(
    "demanda_id",
    linhas.map((d) => d.id)
  )

  return linhas.map((d) => {
    const c = contagem.get(d.id) ?? { total: 0, concluidas: 0 }
    return {
      id: d.id as string,
      nome: texto(d.nome),
      situacao: texto(d.situacao),
      prazo: texto(d.prazo),
      orcamento: numero(d.orcamento),
      responsavelNome: d.membro_responsavel_id
        ? (responsaveis.get(d.membro_responsavel_id as string) ?? null)
        : null,
      tarefasTotal: c.total,
      tarefasConcluidas: c.concluidas,
    }
  })
}

export async function resumoDemandas(): Promise<{
  total: number
  aFazer: number
  fazendo: number
  feito: number
}> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("demandas")
    .select("situacao")
    .eq("emp_proprietaria_id", await tenantAtual())
  const linhas = data ?? []
  return {
    total: linhas.length,
    aFazer: linhas.filter((d) => d.situacao === "A fazer").length,
    fazendo: linhas.filter((d) => d.situacao === "Fazendo").length,
    feito: linhas.filter((d) => d.situacao === "Feito").length,
  }
}

export type DetalheDemanda = {
  id: string
  nome: string | null
  descricao: string | null
  situacao: string | null
  prazo: string | null
  orcamento: number | null
  responsavelId: string | null
  responsavelNome: string | null
  tarefas: TarefaLinha[]
}

export async function obterDemanda(id: string): Promise<DetalheDemanda | null> {
  const admin = await createAdminClient()
  const { data: d } = await admin
    .from("demandas")
    .select("id, nome, descricao, situacao, prazo, orcamento, membro_responsavel_id")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!d) return null

  const responsavelId = texto(d.membro_responsavel_id)
  const [responsaveis, tarefas] = await Promise.all([
    responsavelId ? nomesDosUsuarios([responsavelId]) : Promise.resolve(new Map()),
    listarTarefas({ paiTipo: "demanda", paiId: id }),
  ])

  return {
    id: d.id as string,
    nome: texto(d.nome),
    descricao: texto(d.descricao),
    situacao: texto(d.situacao),
    prazo: texto(d.prazo),
    orcamento: numero(d.orcamento),
    responsavelId,
    responsavelNome: responsavelId ? (responsaveis.get(responsavelId) ?? null) : null,
    tarefas: tarefas.tarefas,
  }
}

export type DadosDemanda = {
  nome: string
  descricao: string | null
  situacao: SituacaoDemanda
  prazo: string | null
  orcamento: number | null
  membro_responsavel_id: string | null
}

export async function criarDemanda(
  dados: DadosDemanda
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("demandas")
    .insert({ ...dados, emp_proprietaria_id: await tenantAtual() })
    .select("id")
    .single()
  if (error) return { erro: `Falha ao criar demanda: ${error.message}` }
  return { id: data.id as string }
}

export async function atualizarDemanda(
  id: string,
  dados: DadosDemanda
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("demandas")
    .update({ ...dados, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao salvar demanda: ${error.message}` }
  return {}
}

export async function definirSituacaoDemanda(
  id: string,
  situacao: SituacaoDemanda
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("demandas")
    .update({ situacao, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao atualizar situação: ${error.message}` }
  return {}
}

// ════════════════════════════════════════════════════════════════════════════
// TAREFAS (a espinha)
// ════════════════════════════════════════════════════════════════════════════

const COLS_TAREFA =
  "id, titulo, concluido, tipo, data_prazo_entrega, data_entrega, demandante_id, demandado_id, demanda_id, projeto_id, anomalia_id"

async function contarTarefasPorPai(
  coluna: "demanda_id" | "projeto_id" | "anomalia_id",
  ids: string[]
): Promise<Map<string, { total: number; concluidas: number }>> {
  const mapa = new Map<string, { total: number; concluidas: number }>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return mapa
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("demandas_check_tarefas")
    .select(`${coluna}, concluido`)
    .in(coluna, unicos)
  if (error) return mapa // coluna ausente antes do SQL → sem contagem
  for (const linha of (data ?? []) as LinhaTarefaBruta[]) {
    const pid = linha[coluna] as string | null
    if (!pid) continue
    const atual = mapa.get(pid) ?? { total: 0, concluidas: 0 }
    atual.total += 1
    if (linha.concluido === true) atual.concluidas += 1
    mapa.set(pid, atual)
  }
  return mapa
}

export type TarefaLinha = {
  id: string
  titulo: string | null
  situacao: SituacaoTarefa
  concluido: boolean
  prazo: string | null
  demandanteNome: string | null
  demandadoNome: string | null
  paiTipo: "demanda" | "projeto" | "anomalia" | null
  paiId: string | null
  paiNome: string | null
}

export type FiltroTarefas = {
  busca?: string
  status?: "pendentes" | "concluidas" | "atrasadas" | "todas"
  demandadoId?: string
  /** Restringe a um pai específico (usado nos detalhes de Demanda/Anomalia). */
  paiTipo?: "demanda" | "projeto" | "anomalia"
  paiId?: string
}

export async function listarTarefas(
  filtro: FiltroTarefas = {}
): Promise<{ disponivel: boolean; aviso?: string; tarefas: TarefaLinha[] }> {
  const admin = await createAdminClient()
  let query = admin
    .from("demandas_check_tarefas")
    .select(COLS_TAREFA)
    .eq("emp_proprietaria_id", await tenantAtual())

  const busca = (filtro.busca ?? "").trim()
  if (busca) query = query.ilike("titulo", `%${busca}%`)
  if (filtro.demandadoId) query = query.eq("demandado_id", filtro.demandadoId)
  if (filtro.paiTipo && filtro.paiId)
    query = query.eq(`${filtro.paiTipo}_id`, filtro.paiId)

  const hoje = hojeISO()
  if (filtro.status === "concluidas") query = query.eq("concluido", true)
  else if (filtro.status === "pendentes") query = query.not("concluido", "is", true)
  else if (filtro.status === "atrasadas")
    query = query.not("concluido", "is", true).lt("data_prazo_entrega", hoje)

  const { data, error } = await query
    .order("data_prazo_entrega", { ascending: true, nullsFirst: false })
    .limit(500)
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, aviso: AVISO_SQL, tarefas: [] }
    throw new Error(`Falha ao listar tarefas: ${error.message}`)
  }

  const linhas = data ?? []
  const nomes = await nomesDosUsuarios(
    linhas.flatMap((t) => [t.demandante_id, t.demandado_id]).filter(Boolean) as string[]
  )
  const paiNomes = await resolverNomesDosPais(linhas)

  return {
    disponivel: true,
    tarefas: linhas.map((t) => {
      const { tipo, id, nome } = paiDaTarefa(t, paiNomes)
      return {
        id: t.id as string,
        titulo: texto(t.titulo),
        situacao: derivarSituacaoTarefa(
          t.concluido as boolean | null,
          texto(t.data_prazo_entrega),
          hoje
        ),
        concluido: t.concluido === true,
        prazo: texto(t.data_prazo_entrega),
        demandanteNome: t.demandante_id
          ? (nomes.get(t.demandante_id as string) ?? null)
          : null,
        demandadoNome: t.demandado_id
          ? (nomes.get(t.demandado_id as string) ?? null)
          : null,
        paiTipo: tipo,
        paiId: id,
        paiNome: nome,
      }
    }),
  }
}

type LinhaTarefaBruta = Record<string, unknown>

function paiDaTarefa(
  t: LinhaTarefaBruta,
  nomes: { demandas: Map<string, string>; projetos: Map<string, string>; anomalias: Map<string, string> }
): { tipo: "demanda" | "projeto" | "anomalia" | null; id: string | null; nome: string | null } {
  if (t.demanda_id)
    return { tipo: "demanda", id: t.demanda_id as string, nome: nomes.demandas.get(t.demanda_id as string) ?? null }
  if (t.projeto_id)
    return { tipo: "projeto", id: t.projeto_id as string, nome: nomes.projetos.get(t.projeto_id as string) ?? null }
  if (t.anomalia_id)
    return { tipo: "anomalia", id: t.anomalia_id as string, nome: nomes.anomalias.get(t.anomalia_id as string) ?? null }
  return { tipo: null, id: null, nome: null }
}

async function resolverNomesDosPais(linhas: LinhaTarefaBruta[]) {
  const admin = await createAdminClient()
  const demandaIds = [...new Set(linhas.map((t) => t.demanda_id).filter(Boolean))] as string[]
  const projetoIds = [...new Set(linhas.map((t) => t.projeto_id).filter(Boolean))] as string[]
  const anomaliaIds = [...new Set(linhas.map((t) => t.anomalia_id).filter(Boolean))] as string[]

  const [demandas, projetos, anomalias] = await Promise.all([
    demandaIds.length
      ? admin.from("demandas").select("id, nome").in("id", demandaIds)
      : Promise.resolve({ data: [] }),
    projetoIds.length
      ? admin.from("projeto").select("id, descricao_sumaria").in("id", projetoIds)
      : Promise.resolve({ data: [] }),
    anomaliaIds.length
      ? admin.from("ferramentas_anomalias").select("id, fato").in("id", anomaliaIds)
      : Promise.resolve({ data: [] }),
  ])
  return {
    demandas: new Map((demandas.data ?? []).map((d) => [d.id as string, texto(d.nome) ?? ""])),
    projetos: new Map((projetos.data ?? []).map((p) => [p.id as string, texto(p.descricao_sumaria) ?? ""])),
    anomalias: new Map((anomalias.data ?? []).map((a) => [a.id as string, texto(a.fato) ?? ""])),
  }
}

export type DadosTarefa = {
  titulo: string
  tipo: string | null
  data_prazo_entrega: string | null
  demandante_id: string | null
  demandado_id: string | null
  /** Pai opcional — no máximo um preenchido. */
  demanda_id?: string | null
  projeto_id?: string | null
  anomalia_id?: string | null
}

export async function criarTarefa(
  dados: DadosTarefa
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("demandas_check_tarefas")
    .insert({
      titulo: dados.titulo,
      tipo: dados.tipo,
      data_prazo_entrega: dados.data_prazo_entrega,
      demandante_id: dados.demandante_id,
      demandado_id: dados.demandado_id,
      demanda_id: dados.demanda_id ?? null,
      projeto_id: dados.projeto_id ?? null,
      anomalia_id: dados.anomalia_id ?? null,
      concluido: false,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Falha ao criar tarefa: ${error.message}` }
  }
  return { id: data.id as string }
}

export async function atualizarTarefa(
  id: string,
  dados: DadosTarefa
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("demandas_check_tarefas")
    .update({
      titulo: dados.titulo,
      tipo: dados.tipo,
      data_prazo_entrega: dados.data_prazo_entrega,
      demandante_id: dados.demandante_id,
      demandado_id: dados.demandado_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao salvar tarefa: ${error.message}` }
  return {}
}

export async function definirConclusaoTarefa(
  id: string,
  concluido: boolean
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("demandas_check_tarefas")
    .update({
      concluido,
      data_entrega: concluido ? hojeISO() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao atualizar tarefa: ${error.message}` }
  return {}
}

// ════════════════════════════════════════════════════════════════════════════
// ANOMALIAS (RCA)
// ════════════════════════════════════════════════════════════════════════════

export type AnomaliaLinha = {
  id: string
  fato: string | null
  dataOcorrencia: string | null
  responsavelNome: string | null
  investigada: boolean
  tratada: boolean
  eficaciaVerificada: boolean
  providencias: number
}

export async function listarAnomalias(filtro: {
  busca?: string
  estagio?: "abertas" | "verificadas" | "todas"
} = {}): Promise<AnomaliaLinha[]> {
  const admin = await createAdminClient()
  let query = admin
    .from("ferramentas_anomalias")
    .select(
      "id, fato, data_ocorrencia, responsavel_id, anomalia_investigada, anomalia_tratada, eficacia_verificada"
    )
    .eq("emp_proprietaria_id", await tenantAtual())

  const busca = (filtro.busca ?? "").trim()
  if (busca) query = query.ilike("fato", `%${busca}%`)
  if (filtro.estagio === "verificadas") query = query.eq("eficacia_verificada", true)
  else if (filtro.estagio === "abertas")
    query = query.not("eficacia_verificada", "is", true)

  const { data, error } = await query.order("data_ocorrencia", {
    ascending: false,
    nullsFirst: false,
  })
  if (error) throw new Error(`Falha ao listar anomalias: ${error.message}`)

  const linhas = data ?? []
  const responsaveis = await nomesDosUsuarios(
    linhas.map((a) => a.responsavel_id as string).filter(Boolean)
  )
  const contagem = await contarTarefasPorPai(
    "anomalia_id",
    linhas.map((a) => a.id)
  )

  return linhas.map((a) => ({
    id: a.id as string,
    fato: texto(a.fato),
    dataOcorrencia: texto(a.data_ocorrencia),
    responsavelNome: a.responsavel_id
      ? (responsaveis.get(a.responsavel_id as string) ?? null)
      : null,
    investigada: a.anomalia_investigada === true,
    tratada: a.anomalia_tratada === true,
    eficaciaVerificada: a.eficacia_verificada === true,
    providencias: contagem.get(a.id)?.total ?? 0,
  }))
}

export async function resumoAnomalias(): Promise<{
  total: number
  abertas: number
  verificadas: number
}> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("ferramentas_anomalias")
    .select("eficacia_verificada")
    .eq("emp_proprietaria_id", await tenantAtual())
  const linhas = data ?? []
  const verificadas = linhas.filter((a) => a.eficacia_verificada === true).length
  return { total: linhas.length, abertas: linhas.length - verificadas, verificadas }
}

export type DetalheAnomalia = {
  id: string
  fato: string | null
  conformidade: string | null
  descricaoDetalhada: string | null
  dataOcorrencia: string | null
  responsavelId: string | null
  responsavelNome: string | null
  investigada: boolean
  tratada: boolean
  eficaciaVerificada: boolean
  causaRaiz: string | null
  porques: (string | null)[]
  providencias: TarefaLinha[]
}

export async function obterAnomalia(id: string): Promise<DetalheAnomalia | null> {
  const admin = await createAdminClient()
  const { data: a } = await admin
    .from("ferramentas_anomalias")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!a) return null

  const responsavelId = texto(a.responsavel_id)
  const [responsaveis, tarefas] = await Promise.all([
    responsavelId ? nomesDosUsuarios([responsavelId]) : Promise.resolve(new Map()),
    listarTarefas({ paiTipo: "anomalia", paiId: id }),
  ])

  return {
    id: a.id as string,
    fato: texto(a.fato),
    conformidade: texto(a.conformidade),
    descricaoDetalhada: texto(a.descricao_detalhada),
    dataOcorrencia: texto(a.data_ocorrencia),
    responsavelId,
    responsavelNome: responsavelId ? (responsaveis.get(responsavelId) ?? null) : null,
    investigada: a.anomalia_investigada === true,
    tratada: a.anomalia_tratada === true,
    eficaciaVerificada: a.eficacia_verificada === true,
    causaRaiz: texto(a.causa_raiz),
    porques: [
      texto(a.investigacao_pq1),
      texto(a.investigacao_pq2),
      texto(a.investigacao_pq3),
      texto(a.investigacao_pq4),
      texto(a.investigacao_pq5),
    ],
    providencias: tarefas.tarefas,
  }
}

export type DadosAnomalia = {
  fato: string
  conformidade: string | null
  descricao_detalhada: string | null
  data_ocorrencia: string | null
  responsavel_id: string | null
  causa_raiz: string | null
  investigacao_pq1: string | null
  investigacao_pq2: string | null
  investigacao_pq3: string | null
  investigacao_pq4: string | null
  investigacao_pq5: string | null
  anomalia_investigada: boolean
  anomalia_tratada: boolean
  eficacia_verificada: boolean
}

export async function criarAnomalia(
  dados: DadosAnomalia
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("ferramentas_anomalias")
    .insert({ ...dados, emp_proprietaria_id: await tenantAtual() })
    .select("id")
    .single()
  if (error) return { erro: `Falha ao criar anomalia: ${error.message}` }
  return { id: data.id as string }
}

export async function atualizarAnomalia(
  id: string,
  dados: DadosAnomalia
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("ferramentas_anomalias")
    .update({ ...dados, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao salvar anomalia: ${error.message}` }
  return {}
}
