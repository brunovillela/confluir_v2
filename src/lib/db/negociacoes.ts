import "server-only"

import { TIPOS_ACORDO, type TipoAcordo } from "@/lib/acordos-constantes"
import { listarRodadasDaCampanha, type RodadaLinha } from "@/lib/db/assembleias"
import { esquemaAusente, hojeSP, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { opcoesFontes } from "@/lib/db/acordos"
import {
  papelDocumento,
  situacaoNegociacao,
  tipoEvento,
  type PapelDocumento,
  type SituacaoNegociacao,
  type TipoEvento,
} from "@/lib/negociacoes-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Negociações sindicais (Fase 3 do comparador). A negociação reúne as
 * empresas, a data-base, o acordo vigente, os documentos (pauta, propostas,
 * contrapropostas, acordo final — linhas de acordo_coletivo com
 * negociacao_id), a campanha de Votações e a linha do tempo.
 * Ver supabase/negociacoes.sql.
 */

export const AVISO_SQL_NEGOCIACOES =
  "Negociações sindicais usam tabelas novas — rode supabase/negociacoes.sql no Supabase."

type Admin = Awaited<ReturnType<typeof createAdminClient>>

function tipoAcordo(v: unknown): TipoAcordo {
  return TIPOS_ACORDO.some((t) => t.chave === v) ? (v as TipoAcordo) : "act"
}

async function empresasPorNegociacao(admin: Admin, empId: string, ids: string[]) {
  const m = new Map<string, { id: string; nome: string }[]>()
  if (!ids.length) return m
  const { data } = await admin
    .from("negociacao_empresas")
    .select("negociacao_id, empresa:empresa_id(id, nome_fantasia, nome_razao)")
    .in("negociacao_id", ids)
    .eq("emp_proprietaria_id", empId)
  for (const l of data ?? []) {
    const e = (Array.isArray(l.empresa) ? l.empresa[0] : l.empresa) as Record<string, unknown> | null
    if (!e) continue
    const lista = m.get(String(l.negociacao_id)) ?? []
    lista.push({ id: String(e.id), nome: String(e.nome_fantasia || e.nome_razao || "(sem nome)") })
    m.set(String(l.negociacao_id), lista)
  }
  return m
}

// ── Lista ────────────────────────────────────────────────────────────────────

export type NegociacaoLinha = {
  id: string
  titulo: string
  tipo: TipoAcordo
  dataBase: string | null
  situacao: SituacaoNegociacao
  empresas: string[]
  documentos: number
  inicio: string | null
  atualizadaEm: string
}

export async function listarNegociacoes(): Promise<{ disponivel: boolean; lista: NegociacaoLinha[] }> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data, error } = await admin
    .from("negociacoes")
    .select("id, titulo, tipo, data_base, situacao, inicio, updated_at, acordo_final_id")
    .eq("emp_proprietaria_id", empId)
    .order("created_at", { ascending: false })
    .limit(500)
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, lista: [] }
    throw new Error(`Falha ao listar negociações: ${error.message}`)
  }
  const ids = (data ?? []).map((n) => String(n.id))
  const [empresas, docs] = await Promise.all([
    empresasPorNegociacao(admin, empId, ids),
    ids.length
      ? admin.from("acordo_coletivo").select("negociacao_id").in("negociacao_id", ids).eq("emp_proprietaria_id", empId)
      : Promise.resolve({ data: [] as { negociacao_id: string }[] }),
  ])
  const nDocs = new Map<string, number>()
  for (const d of docs.data ?? []) nDocs.set(String(d.negociacao_id), (nDocs.get(String(d.negociacao_id)) ?? 0) + 1)
  // Ativas primeiro; dentro de cada grupo, a mais recente.
  const peso = (s: SituacaoNegociacao) => (s === "em_curso" ? 0 : s === "preparacao" ? 1 : 2)
  return {
    disponivel: true,
    lista: (data ?? [])
      .map((n) => ({
        id: String(n.id),
        titulo: String(n.titulo ?? "(sem título)"),
        tipo: tipoAcordo(n.tipo),
        dataBase: texto(n.data_base),
        situacao: situacaoNegociacao(n.situacao),
        empresas: (empresas.get(String(n.id)) ?? []).map((e) => e.nome),
        // O acordo final concluído saiu da negociação, mas é um dos documentos dela.
        documentos: (nDocs.get(String(n.id)) ?? 0) + (n.acordo_final_id ? 1 : 0),
        inicio: texto(n.inicio),
        atualizadaEm: String(n.updated_at),
      }))
      .sort((a, b) => peso(a.situacao) - peso(b.situacao)),
  }
}

// ── Detalhe ──────────────────────────────────────────────────────────────────

export type DocumentoNegociacao = {
  id: string
  titulo: string
  papel: PapelDocumento
  rodada: number | null
  data: string | null
  clausulas: number
  temPdf: boolean
}

export type EventoNegociacao = {
  id: string
  data: string
  tipo: TipoEvento
  titulo: string
  descricao: string | null
  autor: string | null
}

export type NegociacaoDetalhe = {
  id: string
  titulo: string
  tipo: TipoAcordo
  dataBase: string | null
  situacao: SituacaoNegociacao
  inicio: string | null
  conclusao: string | null
  observacoes: string | null
  empresas: { id: string; nome: string }[]
  acordoVigente: { id: string; titulo: string; vigenciaFim: string | null } | null
  acordoFinal: { id: string; titulo: string } | null
  campanha: { id: string; tema: string } | null
  rodadas: RodadaLinha[]
  documentos: DocumentoNegociacao[]
  eventos: EventoNegociacao[]
}

async function tituloAcordo(admin: Admin, empId: string, id: unknown) {
  if (!id) return null
  const { data } = await admin
    .from("acordo_coletivo")
    .select("id, titulo, vigencia_fim")
    .eq("id", String(id))
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  return data ? { id: String(data.id), titulo: String(data.titulo ?? "(sem título)"), vigenciaFim: texto(data.vigencia_fim) } : null
}

export async function obterNegociacao(id: string): Promise<NegociacaoDetalhe | null> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: n } = await admin
    .from("negociacoes")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!n) return null

  const [empresas, vigente, final, campanhaRes, docsRes, evRes] = await Promise.all([
    empresasPorNegociacao(admin, empId, [id]),
    tituloAcordo(admin, empId, n.acordo_vigente_id),
    tituloAcordo(admin, empId, n.acordo_final_id),
    n.campanha_id
      ? admin.from("voto_campanha").select("id, tema").eq("id", n.campanha_id).eq("emp_proprietaria_id", empId).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("acordo_coletivo")
      .select("id, titulo, papel_negociacao, rodada_negociacao, data_documento, documento_url, created_at")
      .eq("negociacao_id", id)
      .eq("emp_proprietaria_id", empId),
    admin
      .from("negociacao_eventos")
      .select("id, data, tipo, titulo, descricao, criado_por_id")
      .eq("negociacao_id", id)
      .eq("emp_proprietaria_id", empId)
      .order("data", { ascending: false }),
  ])

  const docs = docsRes.data ?? []
  const contagem = new Map<string, number>()
  if (docs.length) {
    const { data: cl } = await admin
      .from("acordo_clausulas")
      .select("acordo_id")
      .in("acordo_id", docs.map((d) => d.id))
      .eq("emp_proprietaria_id", empId)
    for (const c of cl ?? []) contagem.set(String(c.acordo_id), (contagem.get(String(c.acordo_id)) ?? 0) + 1)
  }
  // O acordo final já concluído saiu da negociação (negociacao_id nulo): entra
  // na lista pelo acordo_final_id, para o histórico ficar completo.
  if (final && !docs.some((d) => d.id === final.id)) {
    const { data: f } = await admin
      .from("acordo_coletivo")
      .select("id, titulo, papel_negociacao, rodada_negociacao, data_documento, documento_url, created_at")
      .eq("id", final.id)
      .maybeSingle()
    if (f) {
      docs.push(f)
      const { count } = await admin
        .from("acordo_clausulas")
        .select("id", { count: "exact", head: true })
        .eq("acordo_id", f.id)
      contagem.set(String(f.id), count ?? 0)
    }
  }

  const campanha = campanhaRes.data ? { id: String(campanhaRes.data.id), tema: String(campanhaRes.data.tema ?? "(sem tema)") } : null
  const rodadas = campanha ? await listarRodadasDaCampanha(campanha.id).catch(() => []) : []
  const autores = await nomesDosUsuarios((evRes.data ?? []).map((e) => e.criado_por_id as string).filter(Boolean))

  return {
    id: String(n.id),
    titulo: String(n.titulo ?? "(sem título)"),
    tipo: tipoAcordo(n.tipo),
    dataBase: texto(n.data_base),
    situacao: situacaoNegociacao(n.situacao),
    inicio: texto(n.inicio),
    conclusao: texto(n.conclusao),
    observacoes: texto(n.observacoes),
    empresas: empresas.get(id) ?? [],
    acordoVigente: vigente,
    acordoFinal: final,
    campanha,
    rodadas,
    documentos: docs
      .map((d) => ({
        id: String(d.id),
        titulo: String(d.titulo ?? "(sem título)"),
        papel: papelDocumento(d.papel_negociacao) ?? "proposta",
        rodada: typeof d.rodada_negociacao === "number" ? d.rodada_negociacao : null,
        data: texto(d.data_documento) ?? String(d.created_at).slice(0, 10),
        clausulas: contagem.get(String(d.id)) ?? 0,
        temPdf: Boolean(d.documento_url),
      }))
      .sort((a, b) => (a.data ?? "").localeCompare(b.data ?? "") || (a.rodada ?? 0) - (b.rodada ?? 0)),
    eventos: (evRes.data ?? []).map((e) => ({
      id: String(e.id),
      data: String(e.data),
      tipo: tipoEvento(e.tipo),
      titulo: String(e.titulo ?? ""),
      descricao: texto(e.descricao),
      autor: e.criado_por_id ? (autores.get(String(e.criado_por_id)) ?? null) : null,
    })),
  }
}

// ── Opções dos formulários ───────────────────────────────────────────────────

export type OpcoesNegociacao = {
  empresas: { id: string; nome: string }[]
  acordos: { id: string; titulo: string; situacao: string }[]
  campanhas: { id: string; tema: string; finalizado: boolean }[]
}

export async function opcoesNegociacao(): Promise<OpcoesNegociacao> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const [empresas, acordos, campanhas] = await Promise.all([
    opcoesFontes(),
    admin
      .from("acordo_coletivo")
      .select("id, titulo, situacao")
      .eq("emp_proprietaria_id", empId)
      .is("negociacao_id", null)
      .order("vigencia_inicio", { ascending: false, nullsFirst: false })
      .limit(500),
    admin
      .from("voto_campanha")
      .select("id, tema, finalizado")
      .eq("emp_proprietaria_id", empId)
      .order("created_at", { ascending: false })
      .limit(300),
  ])
  return {
    empresas,
    acordos: (acordos.data ?? []).map((a) => ({
      id: String(a.id),
      titulo: String(a.titulo ?? "(sem título)"),
      situacao: String(a.situacao ?? ""),
    })),
    campanhas: (campanhas.data ?? []).map((c) => ({
      id: String(c.id),
      tema: String(c.tema ?? "(sem tema)"),
      finalizado: c.finalizado === true,
    })),
  }
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export type DadosNegociacao = {
  titulo: string
  tipo: TipoAcordo
  dataBase: string | null
  situacao: SituacaoNegociacao
  inicio: string | null
  acordoVigenteId: string | null
  campanhaId: string | null
  observacoes: string | null
  empresaIds: string[]
}

async function gravarEmpresas(admin: Admin, empId: string, negociacaoId: string, ids: string[]) {
  await admin.from("negociacao_empresas").delete().eq("negociacao_id", negociacaoId).eq("emp_proprietaria_id", empId)
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length) {
    await admin
      .from("negociacao_empresas")
      .insert(unicos.map((empresa_id) => ({ negociacao_id: negociacaoId, empresa_id, emp_proprietaria_id: empId })))
  }
}

/** O acordo vigente e a campanha precisam ser do próprio tenant. */
async function validarReferencias(admin: Admin, empId: string, d: DadosNegociacao): Promise<string | null> {
  if (d.acordoVigenteId) {
    const { data } = await admin
      .from("acordo_coletivo")
      .select("id")
      .eq("id", d.acordoVigenteId)
      .eq("emp_proprietaria_id", empId)
      .is("negociacao_id", null)
      .maybeSingle()
    if (!data) return "Acordo vigente não encontrado."
  }
  if (d.campanhaId) {
    const { data } = await admin
      .from("voto_campanha")
      .select("id")
      .eq("id", d.campanhaId)
      .eq("emp_proprietaria_id", empId)
      .maybeSingle()
    if (!data) return "Campanha de votação não encontrada."
  }
  return null
}

function payload(d: DadosNegociacao) {
  return {
    titulo: d.titulo,
    tipo: d.tipo,
    data_base: d.dataBase,
    situacao: d.situacao,
    inicio: d.inicio,
    acordo_vigente_id: d.acordoVigenteId,
    campanha_id: d.campanhaId,
    observacoes: d.observacoes,
    updated_at: new Date().toISOString(),
  }
}

export async function criarNegociacao(d: DadosNegociacao, usuarioId: string): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const invalido = await validarReferencias(admin, empId, d)
  if (invalido) return { erro: invalido }
  const { data, error } = await admin
    .from("negociacoes")
    .insert({ ...payload(d), emp_proprietaria_id: empId, criado_por_id: usuarioId })
    .select("id")
    .single()
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL_NEGOCIACOES : `Falha ao criar: ${error.message}` }
  await gravarEmpresas(admin, empId, String(data.id), d.empresaIds)
  return { id: String(data.id) }
}

export async function atualizarNegociacao(id: string, d: DadosNegociacao): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const invalido = await validarReferencias(admin, empId, d)
  if (invalido) return { erro: invalido }
  const { data: atual } = await admin
    .from("negociacoes")
    .select("situacao")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!atual) return { erro: "Negociação não encontrada." }
  // "Concluída" só pelo botão de concluir (que promove o acordo final); e uma
  // concluída não volta a "em negociação" pela edição.
  if (d.situacao === "concluida" && atual.situacao !== "concluida") {
    return { erro: 'Para concluir, use "Concluir negociação" — ele promove o acordo final a vigente.' }
  }
  if (atual.situacao === "concluida") d = { ...d, situacao: "concluida" }
  const { error } = await admin.from("negociacoes").update(payload(d)).eq("id", id).eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Falha ao salvar: ${error.message}` }
  await gravarEmpresas(admin, empId, id, d.empresaIds)
  return {}
}

export async function excluirNegociacao(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  // Os PDFs dos documentos saem junto (as linhas saem pelo cascade).
  const { data: docs } = await admin
    .from("acordo_coletivo")
    .select("documento_url")
    .eq("negociacao_id", id)
    .eq("emp_proprietaria_id", empId)
  const caminhos = (docs ?? []).map((d) => texto(d.documento_url)).filter((c): c is string => Boolean(c))
  const { error } = await admin.from("negociacoes").delete().eq("id", id).eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Falha ao excluir: ${error.message}` }
  if (caminhos.length) await admin.storage.from("acordos").remove(caminhos)
  return {}
}

export async function adicionarDocumento(
  negociacaoId: string,
  d: { papel: PapelDocumento; rodada: number | null; data: string | null; titulo: string | null }
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: n } = await admin
    .from("negociacoes")
    .select("id, titulo, tipo, data_base, situacao")
    .eq("id", negociacaoId)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!n) return { erro: "Negociação não encontrada." }
  if (n.situacao === "concluida") return { erro: "A negociação já foi concluída." }
  const rotulo = { pauta: "Pauta", proposta: "Proposta da empresa", contraproposta: "Contraproposta", final: "Acordo final" }[d.papel]
  const titulo = d.titulo || `${rotulo}${d.rodada ? ` — ${d.rodada}ª rodada` : ""} · ${n.titulo}`
  const { data, error } = await admin
    .from("acordo_coletivo")
    .insert({
      tipo: tipoAcordo(n.tipo),
      titulo,
      data_base: n.data_base,
      situacao: "em_negociacao",
      negociacao_id: negociacaoId,
      papel_negociacao: d.papel,
      rodada_negociacao: d.rodada,
      data_documento: d.data ?? hojeSP(),
      emp_proprietaria_id: empId,
    })
    .select("id")
    .single()
  if (error) return { erro: `Falha ao criar o documento: ${error.message}` }
  // Mesmas empresas da negociação.
  const { data: emps } = await admin
    .from("negociacao_empresas")
    .select("empresa_id")
    .eq("negociacao_id", negociacaoId)
    .eq("emp_proprietaria_id", empId)
  if (emps?.length) {
    await admin
      .from("acordo_fontes")
      .insert(emps.map((e) => ({ acordo_id: data.id, empresa_id: e.empresa_id, emp_proprietaria_id: empId })))
  }
  // Primeiro documento põe a negociação "em negociação" (se ainda em preparação
  // e o documento não é a própria pauta).
  if (n.situacao === "preparacao" && d.papel !== "pauta") {
    await admin.from("negociacoes").update({ situacao: "em_curso" }).eq("id", negociacaoId).eq("emp_proprietaria_id", empId)
  }
  await tocar(admin, empId, negociacaoId)
  return { id: String(data.id) }
}

export async function atualizarDocumento(
  acordoId: string,
  d: { papel: PapelDocumento; rodada: number | null; data: string | null; titulo: string | null }
): Promise<{ negociacaoId?: string; erro?: string }> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: a } = await admin
    .from("acordo_coletivo")
    .select("negociacao_id")
    .eq("id", acordoId)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!a?.negociacao_id) return { erro: "Documento não encontrado." }
  const { error } = await admin
    .from("acordo_coletivo")
    .update({
      papel_negociacao: d.papel,
      rodada_negociacao: d.rodada,
      data_documento: d.data,
      ...(d.titulo ? { titulo: d.titulo } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", acordoId)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: error.message }
  return { negociacaoId: String(a.negociacao_id) }
}

export async function excluirDocumento(acordoId: string): Promise<{ negociacaoId?: string; erro?: string }> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: a } = await admin
    .from("acordo_coletivo")
    .select("negociacao_id, documento_url")
    .eq("id", acordoId)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  // Só documento ainda dentro da negociação (o final concluído é um acordo).
  if (!a?.negociacao_id) return { erro: "Documento não encontrado." }
  const { error } = await admin.from("acordo_coletivo").delete().eq("id", acordoId).eq("emp_proprietaria_id", empId)
  if (error) return { erro: error.message }
  if (a.documento_url) await admin.storage.from("acordos").remove([String(a.documento_url)])
  return { negociacaoId: String(a.negociacao_id) }
}

export async function registrarEvento(
  negociacaoId: string,
  e: { data: string; tipo: TipoEvento; titulo: string; descricao: string | null },
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: n } = await admin.from("negociacoes").select("id").eq("id", negociacaoId).eq("emp_proprietaria_id", empId).maybeSingle()
  if (!n) return { erro: "Negociação não encontrada." }
  const { error } = await admin.from("negociacao_eventos").insert({
    negociacao_id: negociacaoId,
    data: e.data,
    tipo: e.tipo,
    titulo: e.titulo,
    descricao: e.descricao,
    criado_por_id: usuarioId,
    emp_proprietaria_id: empId,
  })
  if (error) return { erro: error.message }
  await tocar(admin, empId, negociacaoId)
  return {}
}

export async function excluirEvento(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("negociacao_eventos").delete().eq("id", id).eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: error.message } : {}
}

async function tocar(admin: Admin, empId: string, id: string) {
  await admin.from("negociacoes").update({ updated_at: new Date().toISOString() }).eq("id", id).eq("emp_proprietaria_id", empId)
}

/**
 * Fecha a negociação: o documento final sai da negociação (deixa de ser
 * sigiloso), vira o acordo VIGENTE com a vigência informada, e o acordo que
 * estava vigente vai para "arquivado".
 */
export async function concluirNegociacao(
  negociacaoId: string,
  d: { documentoId: string; vigenciaInicio: string | null; vigenciaFim: string | null }
): Promise<{ acordoId?: string; erro?: string }> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: n } = await admin
    .from("negociacoes")
    .select("id, titulo, situacao, acordo_vigente_id")
    .eq("id", negociacaoId)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!n) return { erro: "Negociação não encontrada." }
  if (n.situacao === "concluida") return { erro: "A negociação já foi concluída." }
  const { data: doc } = await admin
    .from("acordo_coletivo")
    .select("id, titulo, negociacao_id")
    .eq("id", d.documentoId)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!doc || doc.negociacao_id !== negociacaoId) return { erro: "Escolha um documento desta negociação." }

  const { error } = await admin
    .from("acordo_coletivo")
    .update({
      negociacao_id: null,
      papel_negociacao: "final",
      // Título automático ("Acordo final · …") vira o nome da negociação, que é
      // como o acordo deve aparecer em Acordos coletivos.
      ...(String(doc.titulo ?? "").startsWith("Acordo final") && n.titulo ? { titulo: n.titulo } : {}),
      situacao: "vigente",
      vigencia_inicio: d.vigenciaInicio,
      vigencia_fim: d.vigenciaFim,
      updated_at: new Date().toISOString(),
    })
    .eq("id", d.documentoId)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Falha ao promover o acordo: ${error.message}` }
  if (n.acordo_vigente_id && n.acordo_vigente_id !== d.documentoId) {
    await admin
      .from("acordo_coletivo")
      .update({ situacao: "arquivado", updated_at: new Date().toISOString() })
      .eq("id", n.acordo_vigente_id)
      .eq("emp_proprietaria_id", empId)
  }
  await admin
    .from("negociacoes")
    .update({
      situacao: "concluida",
      acordo_final_id: d.documentoId,
      conclusao: hojeSP(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", negociacaoId)
    .eq("emp_proprietaria_id", empId)
  return { acordoId: d.documentoId }
}

// ── Quadro comparativo ───────────────────────────────────────────────────────

/**
 * Texto das cláusulas pedidas, só se TODAS forem do acordo vigente, do acordo
 * final ou de documentos da negociação. null = alguma está fora.
 */
export async function textosDoQuadro(negociacaoId: string, clausulaIds: string[]): Promise<Map<string, string> | null> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: n } = await admin
    .from("negociacoes")
    .select("acordo_vigente_id, acordo_final_id")
    .eq("id", negociacaoId)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!n) return null
  const { data: docs } = await admin
    .from("acordo_coletivo")
    .select("id")
    .eq("negociacao_id", negociacaoId)
    .eq("emp_proprietaria_id", empId)
  const permitidos = new Set([n.acordo_vigente_id, n.acordo_final_id, ...(docs ?? []).map((d) => d.id)].filter(Boolean))
  const { data: cls } = await admin
    .from("acordo_clausulas")
    .select("id, acordo_id, texto")
    .in("id", clausulaIds)
    .eq("emp_proprietaria_id", empId)
  if (!cls || cls.length !== new Set(clausulaIds).size) return null
  if (cls.some((c) => !permitidos.has(c.acordo_id))) return null
  return new Map(cls.map((c) => [String(c.id), String(c.texto ?? "")]))
}

export type ClausulaQuadro = {
  id: string
  numero: string | null
  titulo: string | null
  texto: string | null
  tema: string | null
}

async function clausulasDe(admin: Admin, empId: string, acordoId: string | null): Promise<ClausulaQuadro[]> {
  if (!acordoId) return []
  const { data } = await admin
    .from("acordo_clausulas")
    .select("id, numero, titulo, texto, tema, ordem")
    .eq("acordo_id", acordoId)
    .eq("emp_proprietaria_id", empId)
    .order("ordem", { ascending: true })
  return (data ?? []).map((c) => ({
    id: String(c.id),
    numero: texto(c.numero),
    titulo: texto(c.titulo),
    texto: texto(c.texto),
    tema: texto(c.tema),
  }))
}

/**
 * Carrega as três colunas. Pauta = a mais recente; proposta = a escolhida ou a
 * última proposta/contraproposta/final (por data e rodada).
 */
export async function dadosDoQuadro(
  n: NegociacaoDetalhe,
  propostaId: string | null
): Promise<{
  pautaDoc: DocumentoNegociacao | null
  propostaDoc: DocumentoNegociacao | null
  candidatas: DocumentoNegociacao[]
  vigente: ClausulaQuadro[]
  pauta: ClausulaQuadro[]
  proposta: ClausulaQuadro[] | null
}> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const pautas = n.documentos.filter((d) => d.papel === "pauta")
  const candidatas = n.documentos.filter((d) => d.papel !== "pauta")
  const pautaDoc = pautas.at(-1) ?? null
  const propostaDoc = candidatas.find((d) => d.id === propostaId) ?? candidatas.at(-1) ?? null
  const [vigente, pauta, proposta] = await Promise.all([
    clausulasDe(admin, empId, n.acordoVigente?.id ?? null),
    clausulasDe(admin, empId, pautaDoc?.id ?? null),
    propostaDoc ? clausulasDe(admin, empId, propostaDoc.id) : Promise.resolve(null),
  ])
  return { pautaDoc, propostaDoc, candidatas, vigente, pauta, proposta }
}
