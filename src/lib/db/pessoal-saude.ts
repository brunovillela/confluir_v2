import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { referenciaDaData } from "@/lib/db/carreira"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Saúde ocupacional do Pessoal — atestados médicos, ausências e ASOs.
 *
 * Tabelas migradas do Bubble (medidas em 2026-07-18):
 * - `pes_atestados_medicos` (169): inicio/termino, quantidade_dias, cid10,
 *   consideracao, `atestado` = arquivo, acompanhamento (nome_acompanhado,
 *   filho_menor_6_anos), mes/ano são ENUMS de texto (derivados do início).
 * - `pessoal_ausencias` (384): inicio/termino/motivo; `atestado_id` opcional
 *   liga a ausência ao atestado que a justificou.
 * - `aso` (65): data, tipo (texto NR-7), vencimento, realizado, enviado,
 *   `ultimo` marca o ASO mais recente do funcionário — recalculado aqui a
 *   cada gravação.
 *
 * Arquivos novos vão ao bucket privado 'pessoal'; legados são URLs
 * //cdn.bubble (urlArquivoPessoal em db/pessoal.ts resolve os dois).
 */

export const TIPOS_ASO = [
  "Admissional",
  "Periódico",
  "Retorno ao trabalho",
  "Mudança de riscos ocupacionais",
  "Demissional",
] as const

async function nomesDosUsuarios(ids: string[]): Promise<Map<string, string>> {
  const nomes = new Map<string, string>()
  if (ids.length === 0) return nomes
  const admin = await createAdminClient()
  const { data } = await admin
    .from("usuarios")
    .select("id, nome_completo, nome_guerra")
    .in("id", ids)
  for (const u of data ?? []) {
    const nome = [u.nome_completo, u.nome_guerra].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    )
    if (nome) nomes.set(u.id, nome)
  }
  return nomes
}

function comNomes<T extends { funcionario_id: string | null }>(
  linhas: T[],
  nomes: Map<string, string>
): (T & { funcionarioNome: string | null })[] {
  return linhas.map((l) => ({
    ...l,
    funcionarioNome: l.funcionario_id
      ? (nomes.get(l.funcionario_id) ?? null)
      : null,
  }))
}

// ── Atestados médicos ──────────────────────────────────────────────────────

export type Atestado = {
  id: string
  funcionario_id: string | null
  funcionarioNome: string | null
  inicio: string | null
  termino: string | null
  quantidade_dias: number | null
  cid10: string | null
  consideracao: string | null
  atestado: string | null
  atestado_acompanhamento: boolean | null
  nome_acompanhado: string | null
  filho_menor_6_anos: boolean | null
  ano: string | null
  created_at: string | null
}

const SELECT_ATESTADO =
  "id, funcionario_id, inicio, termino, quantidade_dias, cid10, consideracao, atestado, atestado_acompanhamento, nome_acompanhado, filho_menor_6_anos, ano, created_at"

export async function listarAtestados(): Promise<Atestado[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pes_atestados_medicos")
    .select(SELECT_ATESTADO)
    .order("inicio", { ascending: false, nullsFirst: false })
  if (error) throw new Error(`Falha ao listar atestados: ${error.message}`)
  const linhas = (data ?? []) as Omit<Atestado, "funcionarioNome">[]
  const nomes = await nomesDosUsuarios([
    ...new Set(
      linhas.map((a) => a.funcionario_id).filter((v): v is string => !!v)
    ),
  ])
  return comNomes(linhas, nomes)
}

export async function buscarAtestado(id: string): Promise<Atestado | null> {
  const atestados = await listarAtestados()
  return atestados.find((a) => a.id === id) ?? null
}

export type DadosAtestado = {
  funcionario_id: string
  inicio: string
  termino: string | null
  quantidade_dias: number | null
  cid10: string | null
  consideracao: string | null
  atestado_acompanhamento: boolean
  nome_acompanhado: string | null
  filho_menor_6_anos: boolean
  /** Caminho no bucket 'pessoal'; null mantém o arquivo atual na edição. */
  arquivo: string | null
}

function registroAtestado(dados: DadosAtestado) {
  const { mes, ano } = referenciaDaData(dados.inicio)
  return {
    funcionario_id: dados.funcionario_id,
    inicio: dados.inicio,
    termino: dados.termino,
    quantidade_dias: dados.quantidade_dias,
    cid10: dados.cid10,
    consideracao: dados.consideracao,
    atestado_acompanhamento: dados.atestado_acompanhamento,
    nome_acompanhado: dados.nome_acompanhado,
    filho_menor_6_anos: dados.filho_menor_6_anos,
    mes,
    ano,
    ...(dados.arquivo !== null ? { atestado: dados.arquivo } : {}),
  }
}

export async function criarAtestado(
  dados: DadosAtestado
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("pes_atestados_medicos")
    .insert(registroAtestado(dados))
  if (error) return { erro: `Não foi possível criar: ${error.message}` }
  return {}
}

export async function atualizarAtestado(
  id: string,
  dados: DadosAtestado
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pes_atestados_medicos")
    .update(registroAtestado(dados), { count: "exact" })
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Atestado não encontrado." }
  return {}
}

export async function excluirAtestado(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  // Ausência justificada pelo atestado impede a exclusão.
  const { count: vinculos } = await admin
    .from("pessoal_ausencias")
    .select("id", { count: "exact", head: true })
    .eq("atestado_id", id)
  if ((vinculos ?? 0) > 0) {
    return {
      erro: `Este atestado justifica ${vinculos} ausência${vinculos === 1 ? "" : "s"} — desvincule antes de excluir.`,
    }
  }
  const { error, count } = await admin
    .from("pes_atestados_medicos")
    .delete({ count: "exact" })
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (count === 0) return { erro: "Atestado não encontrado." }
  return {}
}

// ── Ausências ──────────────────────────────────────────────────────────────

export type Ausencia = {
  id: string
  funcionario_id: string | null
  funcionarioNome: string | null
  inicio: string | null
  termino: string | null
  motivo: string | null
  atestado_id: string | null
  created_at: string | null
}

export async function listarAusencias(): Promise<Ausencia[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_ausencias")
    .select("id, funcionario_id, inicio, termino, motivo, atestado_id, created_at")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("inicio", { ascending: false, nullsFirst: false })
  if (error) throw new Error(`Falha ao listar ausências: ${error.message}`)
  const linhas = (data ?? []) as Omit<Ausencia, "funcionarioNome">[]
  const nomes = await nomesDosUsuarios([
    ...new Set(
      linhas.map((a) => a.funcionario_id).filter((v): v is string => !!v)
    ),
  ])
  return comNomes(linhas, nomes)
}

/** Autoatendimento: ausências do próprio funcionário logado. */
export async function minhasAusencias(usuarioId: string): Promise<Ausencia[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("pessoal_ausencias")
    .select("id, funcionario_id, inicio, termino, motivo, atestado_id, created_at")
    .eq("funcionario_id", usuarioId)
    .order("inicio", { ascending: false, nullsFirst: false })
  return (data ?? []).map((a) => ({
    ...(a as Omit<Ausencia, "funcionarioNome">),
    funcionarioNome: null,
  }))
}

/** Autoatendimento: atestados médicos do próprio funcionário logado. */
export async function meusAtestados(usuarioId: string): Promise<Atestado[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("pes_atestados_medicos")
    .select(SELECT_ATESTADO)
    .eq("funcionario_id", usuarioId)
    .order("inicio", { ascending: false, nullsFirst: false })
  return (data ?? []).map((a) => ({
    ...(a as Omit<Atestado, "funcionarioNome">),
    funcionarioNome: null,
  }))
}

export type DadosAusencia = {
  funcionario_id: string
  inicio: string
  termino: string | null
  motivo: string | null
}

export async function criarAusencia(
  dados: DadosAusencia
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_ausencias").insert({
    ...dados,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível criar: ${error.message}` }
  return {}
}

export async function atualizarAusencia(
  id: string,
  dados: DadosAusencia
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_ausencias")
    .update({ ...dados, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Ausência não encontrada." }
  return {}
}

export async function excluirAusencia(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_ausencias")
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (count === 0) return { erro: "Ausência não encontrada." }
  return {}
}

// ── ASO ────────────────────────────────────────────────────────────────────

export type Aso = {
  id: string
  funcionario_id: string | null
  funcionarioNome: string | null
  data: string | null
  tipo: string | null
  vencimento: string | null
  realizado: boolean | null
  enviado: boolean | null
  ultimo: boolean | null
  arquivo: string | null
  created_at: string | null
}

const SELECT_ASO =
  "id, funcionario_id, data, tipo, vencimento, realizado, enviado, ultimo, arquivo, created_at"

export async function listarAsos(): Promise<Aso[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("aso")
    .select(SELECT_ASO)
    .order("data", { ascending: false, nullsFirst: false })
  if (error) throw new Error(`Falha ao listar ASOs: ${error.message}`)
  const linhas = (data ?? []) as Omit<Aso, "funcionarioNome">[]
  const nomes = await nomesDosUsuarios([
    ...new Set(
      linhas.map((a) => a.funcionario_id).filter((v): v is string => !!v)
    ),
  ])
  return comNomes(linhas, nomes)
}

export async function buscarAso(id: string): Promise<Aso | null> {
  const asos = await listarAsos()
  return asos.find((a) => a.id === id) ?? null
}

/** ASOs do próprio funcionário (autosserviço). */
export async function meusAsos(usuarioId: string): Promise<Aso[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("aso")
    .select(SELECT_ASO)
    .eq("funcionario_id", usuarioId)
    .order("data", { ascending: false, nullsFirst: false })
  if (error) throw new Error(`Falha ao listar seus ASOs: ${error.message}`)
  return ((data ?? []) as Omit<Aso, "funcionarioNome">[]).map((a) => ({
    ...a,
    funcionarioNome: null,
  }))
}

/** `ultimo` = ASO de data mais recente do funcionário (modelo do Bubble). */
async function recomputarUltimoAso(funcionarioId: string): Promise<void> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("aso")
    .select("id")
    .eq("funcionario_id", funcionarioId)
    .order("data", { ascending: false, nullsFirst: false })
    .limit(1)
  const ultimoId = data?.[0]?.id ?? null
  await admin
    .from("aso")
    .update({ ultimo: false })
    .eq("funcionario_id", funcionarioId)
    .neq("id", ultimoId ?? "00000000-0000-0000-0000-000000000000")
  if (ultimoId) {
    await admin.from("aso").update({ ultimo: true }).eq("id", ultimoId)
  }
}

export type DadosAso = {
  funcionario_id: string
  data: string
  tipo: string
  vencimento: string | null
  realizado: boolean
  enviado: boolean
  /** Caminho no bucket 'pessoal'; null mantém o arquivo atual na edição. */
  arquivo: string | null
}

function registroAso(dados: DadosAso) {
  return {
    funcionario_id: dados.funcionario_id,
    data: dados.data,
    tipo: dados.tipo,
    vencimento: dados.vencimento,
    realizado: dados.realizado,
    enviado: dados.enviado,
    ...(dados.arquivo !== null ? { arquivo: dados.arquivo } : {}),
  }
}

export async function criarAso(dados: DadosAso): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("aso").insert(registroAso(dados))
  if (error) return { erro: `Não foi possível criar: ${error.message}` }
  await recomputarUltimoAso(dados.funcionario_id)
  return {}
}

export async function atualizarAso(
  id: string,
  dados: DadosAso
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: anterior } = await admin
    .from("aso")
    .select("funcionario_id")
    .eq("id", id)
    .maybeSingle()
  const { error, count } = await admin
    .from("aso")
    .update(registroAso(dados), { count: "exact" })
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "ASO não encontrado." }
  await recomputarUltimoAso(dados.funcionario_id)
  // Trocou o funcionário: recalcula também o anterior.
  if (anterior?.funcionario_id && anterior.funcionario_id !== dados.funcionario_id) {
    await recomputarUltimoAso(anterior.funcionario_id)
  }
  return {}
}

export async function excluirAso(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("aso")
    .delete()
    .eq("id", id)
    .select("funcionario_id")
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if ((data ?? []).length === 0) return { erro: "ASO não encontrado." }
  if (data![0].funcionario_id) await recomputarUltimoAso(data![0].funcionario_id)
  return {}
}
