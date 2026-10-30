import { cache as cacheReact } from "react"
import "server-only"
import { lerEmLotes, nomesDosUsuarios } from "@/lib/db/comum"
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
 * - `pessoal_ausencias` (384): inicio/termino/motivo; `atestado_id` liga a
 *   ausência ao atestado que a gerou (desde 30/10, todo atestado gera a sua).
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
  // PostgREST corta em 1.000 linhas — lê em lotes.
  let linhas: Omit<Atestado, "funcionarioNome">[]
  try {
    linhas = await lerEmLotes<Omit<Atestado, "funcionarioNome">>((de, ate) =>
      admin
        .from("pes_atestados_medicos")
        .select(SELECT_ATESTADO)
        .order("inicio", { ascending: false, nullsFirst: false })
        .order("id")
        .range(de, ate)
    )
  } catch (e) {
    throw new Error(`Falha ao listar atestados: ${(e as Error).message}`)
  }
  const nomes = await nomesDosUsuarios([
    ...new Set(
      linhas.map((a) => a.funcionario_id).filter((v): v is string => !!v)
    ),
  ])
  return comNomes(linhas, nomes)
}

export async function buscarAtestado(id: string): Promise<Atestado | null> {
  // Direto pelo id: achar na lista perdia os antigos (PostgREST corta em 1.000 linhas).
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pes_atestados_medicos")
    .select(SELECT_ATESTADO)
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(`Falha ao buscar atestado: ${error.message}`)
  if (!data) return null
  const linha = data as Omit<Atestado, "funcionarioNome">
  const nomes = await nomesDosUsuarios(
    linha.funcionario_id ? [linha.funcionario_id] : []
  )
  return comNomes([linha], nomes)[0]
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

// ── Atestado → ausência (30/10) ────────────────────────────────────────────
//
// Todo atestado aparece nas ausências como "Afastamento médico", ligado por
// pessoal_ausencias.atestado_id (mesmo desenho do gozo de férias em
// db/ferias.ts). Editar o atestado acompanha a ausência; excluí-lo a tira. A
// ausência ligada não se edita pela aba Ausências — só pelo atestado. O CID
// fica só no atestado: a ausência aparece na coluna do dia e no Meu perfil.

const MOTIVO_ATESTADO = "Afastamento médico"

/**
 * Deixa a ausência do atestado de acordo com ele. `antes` (o atestado antes
 * da edição) acha o afastamento lançado à mão antes da automação, sem o
 * vínculo — assim ele é adotado em vez de ganhar uma duplicata.
 */
async function sincronizarAusenciaDoAtestado(
  atestadoId: string,
  antes?: { funcionario_id: string | null; inicio: string | null; termino: string | null }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [{ data: a }, { data: ligadas }] = await Promise.all([
    admin
      .from("pes_atestados_medicos")
      .select("id, funcionario_id, inicio, termino, atestado_acompanhamento, nome_acompanhado")
      .eq("id", atestadoId)
      .maybeSingle(),
    admin.from("pessoal_ausencias").select("id").eq("atestado_id", atestadoId).eq("emp_proprietaria_id", emp),
  ])
  const ids = (ligadas ?? []).map((l) => String(l.id))
  const falha = (e: { message: string } | null) =>
    e ? { erro: `O atestado foi salvo, mas a ausência não: ${e.message}` } : {}

  if (!a || !a.funcionario_id || !a.inicio || !a.termino) {
    if (ids.length) return falha((await admin.from("pessoal_ausencias").delete().in("id", ids)).error)
    return {}
  }
  const campos = {
    funcionario_id: a.funcionario_id,
    inicio: a.inicio,
    termino: a.termino,
    motivo: MOTIVO_ATESTADO,
    ...((await temObservacao())
      ? {
          observacao: a.atestado_acompanhamento
            ? `Atestado de acompanhamento${a.nome_acompanhado ? ` (${a.nome_acompanhado})` : ""}`
            : "Atestado médico",
        }
      : {}),
    updated_at: new Date().toISOString(),
  }
  if (ids.length) {
    if (ids.length > 1) await admin.from("pessoal_ausencias").delete().in("id", ids.slice(1))
    return falha((await admin.from("pessoal_ausencias").update(campos).eq("id", ids[0])).error)
  }
  // Afastamento médico lançado à mão (sem vínculo) no mesmo intervalo: adota.
  const ref =
    antes?.funcionario_id && antes.inicio && antes.termino
      ? { funcionario_id: antes.funcionario_id, inicio: antes.inicio, termino: antes.termino }
      : { funcionario_id: a.funcionario_id, inicio: a.inicio, termino: a.termino }
  const { data: avulsa } = await admin
    .from("pessoal_ausencias")
    .select("id")
    .eq("emp_proprietaria_id", emp)
    .eq("funcionario_id", ref.funcionario_id)
    .eq("motivo", MOTIVO_ATESTADO)
    .is("atestado_id", null)
    .is("ferias_id", null)
    .is("falta_id", null)
    .lte("inicio", ref.termino)
    .gte("termino", ref.inicio)
    .order("inicio")
    .limit(1)
  const { error } = avulsa?.length
    ? await admin.from("pessoal_ausencias").update({ ...campos, atestado_id: atestadoId }).eq("id", avulsa[0].id)
    : await admin.from("pessoal_ausencias").insert({ ...campos, atestado_id: atestadoId, emp_proprietaria_id: emp })
  return falha(error)
}

export async function criarAtestado(
  dados: DadosAtestado
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pes_atestados_medicos")
    .insert(registroAtestado(dados))
    .select("id")
    .single()
  if (error) return { erro: `Não foi possível criar: ${error.message}` }
  return sincronizarAusenciaDoAtestado(String(data.id))
}

export async function atualizarAtestado(
  id: string,
  dados: DadosAtestado
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: antes } = await admin
    .from("pes_atestados_medicos")
    .select("funcionario_id, inicio, termino")
    .eq("id", id)
    .maybeSingle()
  const { error, count } = await admin
    .from("pes_atestados_medicos")
    .update(registroAtestado(dados), { count: "exact" })
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Atestado não encontrado." }
  return sincronizarAusenciaDoAtestado(id, antes ?? undefined)
}

export async function excluirAtestado(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  // A ausência do atestado sai junto (a FK não tem ON DELETE).
  const { error: erroAusencia } = await admin
    .from("pessoal_ausencias")
    .delete()
    .eq("atestado_id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (erroAusencia) {
    return { erro: `Não foi possível excluir a ausência do atestado: ${erroAusencia.message}` }
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
  observacao?: string | null
  atestado_id: string | null
  created_at: string | null
}

export async function listarAusencias(): Promise<Ausencia[]> {
  const admin = await createAdminClient()
  const colunas =
    "id, funcionario_id, inicio, termino, motivo, atestado_id, created_at" +
    ((await temObservacao()) ? ", observacao" : "")
  const tenant = await tenantAtual()
  // PostgREST corta em 1.000 linhas — lê em lotes.
  let linhas: Omit<Ausencia, "funcionarioNome">[]
  try {
    linhas = await lerEmLotes<Omit<Ausencia, "funcionarioNome">>((de, ate) =>
      admin
        .from("pessoal_ausencias")
        .select(colunas)
        .eq("emp_proprietaria_id", tenant)
        .order("inicio", { ascending: false, nullsFirst: false })
        .order("id")
        .range(de, ate)
    )
  } catch (e) {
    throw new Error(`Falha ao listar ausências: ${(e as Error).message}`)
  }
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
  /** Tipo da ausência (lista fechada em src/lib/ausencias.ts). */
  motivo: string | null
  /** Detalhe do caso — qual seminário, qual licença. */
  observacao?: string | null
}

/** A coluna de observação existe? (supabase/ausencias-observacao.sql) */
const temObservacao = cacheReact(async (): Promise<boolean> => {
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_ausencias").select("observacao").limit(1)
  return !error
})

/** Sem a coluna, a observação é descartada em vez de derrubar o registro. */
async function comObservacao(dados: DadosAusencia): Promise<Record<string, unknown>> {
  const { observacao, ...resto } = dados
  return (await temObservacao()) ? { ...resto, observacao: observacao ?? null } : resto
}

export async function criarAusencia(
  dados: DadosAusencia
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_ausencias").insert({
    ...(await comObservacao(dados)),
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível criar: ${error.message}` }
  return {}
}

/** A ausência gerada por um atestado só muda pelo atestado. */
async function ausenciaDeAtestado(id: string): Promise<boolean> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("pessoal_ausencias")
    .select("atestado_id")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return Boolean(data?.atestado_id)
}

export async function atualizarAusencia(
  id: string,
  dados: DadosAusencia
): Promise<{ erro?: string }> {
  if (await ausenciaDeAtestado(id)) return { erro: "Esta ausência vem de um atestado médico: edite o atestado." }
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_ausencias")
    .update(
      { ...(await comObservacao(dados)), updated_at: new Date().toISOString() },
      { count: "exact" }
    )
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Ausência não encontrada." }
  return {}
}

export async function excluirAusencia(id: string): Promise<{ erro?: string }> {
  if (await ausenciaDeAtestado(id)) return { erro: "Esta ausência vem de um atestado médico: exclua o atestado." }
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
  // PostgREST corta em 1.000 linhas — lê em lotes.
  let linhas: Omit<Aso, "funcionarioNome">[]
  try {
    linhas = await lerEmLotes<Omit<Aso, "funcionarioNome">>((de, ate) =>
      admin
        .from("aso")
        .select(SELECT_ASO)
        .order("data", { ascending: false, nullsFirst: false })
        .order("id")
        .range(de, ate)
    )
  } catch (e) {
    throw new Error(`Falha ao listar ASOs: ${(e as Error).message}`)
  }
  const nomes = await nomesDosUsuarios([
    ...new Set(
      linhas.map((a) => a.funcionario_id).filter((v): v is string => !!v)
    ),
  ])
  return comNomes(linhas, nomes)
}

export async function buscarAso(id: string): Promise<Aso | null> {
  // Direto pelo id: achar na lista perdia os antigos (PostgREST corta em 1.000 linhas).
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("aso")
    .select(SELECT_ASO)
    .eq("id", id)
    .maybeSingle()
  if (error) throw new Error(`Falha ao buscar ASO: ${error.message}`)
  if (!data) return null
  const linha = data as Omit<Aso, "funcionarioNome">
  const nomes = await nomesDosUsuarios(
    linha.funcionario_id ? [linha.funcionario_id] : []
  )
  return comNomes([linha], nomes)[0]
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
