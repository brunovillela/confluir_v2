import "server-only"
import { randomUUID } from "node:crypto"

import { tenantAtual } from "@/lib/tenant"

import {
  listarMandatos,
  urlDocumentoDiretoria,
} from "@/lib/db/diretoria"
import { createAdminClient } from "@/lib/supabase/admin"
import { TIPOS_REUNIAO, type TipoReuniao } from "@/lib/atas-constantes"

/**
 * Atas de reunião (`reuniao_ata`) — ancoradas no mandato. PDF no bucket
 * `diretoria` (subpasta `atas/`), reusando `urlDocumentoDiretoria` p/ ler.
 */

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null
}
function escaparLike(t: string): string {
  return t.replace(/[%_\\]/g, "\\$&")
}
function tipoValido(t: string): TipoReuniao {
  return TIPOS_REUNIAO.some((x) => x.chave === t) ? (t as TipoReuniao) : "outra"
}

async function nomesDeMandatos(): Promise<Map<string, string | null>> {
  const mapa = new Map<string, string | null>()
  const mandatos = await listarMandatos()
  for (const m of mandatos) mapa.set(m.id, m.mandato)
  return mapa
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export type AtaLinha = {
  id: string
  tipo: TipoReuniao
  titulo: string | null
  data: string | null
  mandatoId: string | null
  mandatoNome: string | null
}

export type FiltrosAtas = {
  tipo?: TipoReuniao | "todos"
  mandatoId?: string
  busca?: string
}

export async function listarAtas(filtros: FiltrosAtas = {}): Promise<AtaLinha[]> {
  const admin = await createAdminClient()
  let q = admin
    .from("reuniao_ata")
    .select("id, tipo, titulo, data, mandato_id")
    .eq("emp_proprietaria_id", await tenantAtual())

  if (filtros.tipo && filtros.tipo !== "todos") q = q.eq("tipo", filtros.tipo)
  if (filtros.mandatoId) q = q.eq("mandato_id", filtros.mandatoId)
  const termo = (filtros.busca ?? "").trim()
  if (termo) {
    const e = escaparLike(termo)
    q = q.or(`titulo.ilike.%${e}%,orgao.ilike.%${e}%`)
  }

  const { data, error } = await q
    .order("data", { ascending: false, nullsFirst: false })
    .limit(1000)
  if (error) throw new Error(`Falha ao listar atas: ${error.message}`)

  const nomes = await nomesDeMandatos()
  return (data ?? []).map((a) => ({
    id: String(a.id),
    tipo: tipoValido(String(a.tipo ?? "outra")),
    titulo: texto(a.titulo),
    data: texto(a.data),
    mandatoId: texto(a.mandato_id),
    mandatoNome: a.mandato_id ? (nomes.get(String(a.mandato_id)) ?? null) : null,
  }))
}

export type AtaDetalhe = {
  id: string
  mandatoId: string | null
  mandatoNome: string | null
  tipo: TipoReuniao
  orgao: string | null
  titulo: string | null
  data: string | null
  hora: string | null
  local: string | null
  pauta: string | null
  deliberacoes: string | null
  presentes: string | null
  observacoes: string | null
  documentoUrl: string | null
}

export async function obterAta(id: string): Promise<AtaDetalhe | null> {
  const admin = await createAdminClient()
  const { data: a } = await admin
    .from("reuniao_ata")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!a) return null

  let mandatoNome: string | null = null
  if (a.mandato_id) {
    const nomes = await nomesDeMandatos()
    mandatoNome = nomes.get(String(a.mandato_id)) ?? null
  }
  const documentoUrl = await urlDocumentoDiretoria(texto(a.documento_url))

  return {
    id: String(a.id),
    mandatoId: texto(a.mandato_id),
    mandatoNome,
    tipo: tipoValido(String(a.tipo ?? "outra")),
    orgao: texto(a.orgao),
    titulo: texto(a.titulo),
    data: texto(a.data),
    hora: texto(a.hora),
    local: texto(a.local),
    pauta: texto(a.pauta),
    deliberacoes: texto(a.deliberacoes),
    presentes: texto(a.presentes),
    observacoes: texto(a.observacoes),
    documentoUrl,
  }
}

/** Mandatos p/ o seletor (id + rótulo). */
export async function opcoesMandatos(): Promise<
  { id: string; nome: string }[]
> {
  const mandatos = await listarMandatos()
  return mandatos.map((m) => ({
    id: m.id,
    nome: m.mandato ?? "(mandato sem nome)",
  }))
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export type DadosAta = {
  mandato_id: string | null
  tipo: TipoReuniao
  orgao: string | null
  titulo: string | null
  data: string | null
  hora: string | null
  local: string | null
  pauta: string | null
  deliberacoes: string | null
  presentes: string | null
  observacoes: string | null
  /** Caminho já gravável (upload na action); undefined = não mexer. */
  documento_url?: string | null
}

function payload(d: DadosAta): Record<string, unknown> {
  const p: Record<string, unknown> = {
    mandato_id: d.mandato_id,
    tipo: tipoValido(d.tipo),
    orgao: d.orgao,
    titulo: d.titulo,
    data: d.data,
    hora: d.hora,
    local: d.local,
    pauta: d.pauta,
    deliberacoes: d.deliberacoes,
    presentes: d.presentes,
    observacoes: d.observacoes,
    updated_at: new Date().toISOString(),
  }
  if (d.documento_url !== undefined) p.documento_url = d.documento_url
  return p
}

export async function criarAta(
  dados: DadosAta
): Promise<{ id?: string; erro?: string }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("reuniao_ata")
    .insert({ ...payload(dados), emp_proprietaria_id: empId })
    .select("id")
    .single()
  if (error) return { erro: `Falha ao criar a ata: ${error.message}` }
  return { id: String(data.id) }
}

export async function atualizarAta(
  id: string,
  dados: DadosAta
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("reuniao_ata")
    .update(payload(dados))
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao salvar a ata: ${error.message}` }
  return {}
}

export async function excluirAta(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("reuniao_ata")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao excluir a ata: ${error.message}` }
  return {}
}

export async function subirDocumentoAta(
  arquivo: File
): Promise<{ caminho?: string; erro?: string }> {
  if (arquivo.type !== "application/pdf") {
    return { erro: "A ata deve ser um PDF." }
  }
  const admin = await createAdminClient()
  const caminho = `atas/${randomUUID()}.pdf`
  const { error } = await admin.storage
    .from("diretoria")
    .upload(caminho, arquivo, { contentType: "application/pdf", upsert: false })
  if (error) return { erro: `Falha ao subir o PDF: ${error.message}` }
  return { caminho }
}
