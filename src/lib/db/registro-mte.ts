import "server-only"
import { texto } from "@/lib/db/comum"
import { randomUUID } from "node:crypto"

import { tenantAtual } from "@/lib/tenant"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  SITUACOES_REGISTRO_MTE,
  TIPOS_REGISTRO_MTE,
  type SituacaoRegistroMte,
  type TipoRegistroMte,
} from "@/lib/registro-mte-constantes"

/**
 * Registros sindicais da entidade no MTE (registro sindical / CNES / carta).
 * Poucas linhas — é config da própria entidade. Bucket privado `representacao`.
 */

const BUCKET = "representacao"

export type RegistroLinha = {
  id: string
  tipo: TipoRegistroMte
  numero: string | null
  categoria: string | null
  data_registro: string | null
  situacao: SituacaoRegistroMte
}

export async function listarRegistros(): Promise<RegistroLinha[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("registro_sindical")
    .select("id, tipo, numero, categoria, data_registro, situacao")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("data_registro", { ascending: false, nullsFirst: false })
  if (error) throw new Error(`Falha ao listar registros: ${error.message}`)
  return (data ?? []).map((r) => ({
    id: String(r.id),
    tipo: (r.tipo ?? "registro_sindical") as TipoRegistroMte,
    numero: texto(r.numero),
    categoria: texto(r.categoria),
    data_registro: texto(r.data_registro),
    situacao: (r.situacao ?? "ativo") as SituacaoRegistroMte,
  }))
}

export type RegistroDetalhe = {
  id: string
  tipo: TipoRegistroMte
  numero: string | null
  categoria: string | null
  abrangencia: string | null
  data_registro: string | null
  data_publicacao: string | null
  situacao: SituacaoRegistroMte
  observacoes: string | null
  documentoUrl: string | null
}

export async function obterRegistro(
  id: string
): Promise<RegistroDetalhe | null> {
  const admin = await createAdminClient()
  const { data: r } = await admin
    .from("registro_sindical")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!r) return null

  let documentoUrl: string | null = null
  const caminho = texto(r.documento_url)
  if (caminho) {
    const { data } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(caminho, 3600)
    documentoUrl = data?.signedUrl ?? null
  }

  return {
    id: String(r.id),
    tipo: (r.tipo ?? "registro_sindical") as TipoRegistroMte,
    numero: texto(r.numero),
    categoria: texto(r.categoria),
    abrangencia: texto(r.abrangencia),
    data_registro: texto(r.data_registro),
    data_publicacao: texto(r.data_publicacao),
    situacao: (r.situacao ?? "ativo") as SituacaoRegistroMte,
    observacoes: texto(r.observacoes),
    documentoUrl,
  }
}

export type DadosRegistro = {
  tipo: TipoRegistroMte
  numero: string | null
  categoria: string | null
  abrangencia: string | null
  data_registro: string | null
  data_publicacao: string | null
  situacao: SituacaoRegistroMte
  observacoes: string | null
  /** Caminho já gravável (upload na action); undefined = não mexer. */
  documento_url?: string | null
}

function payload(d: DadosRegistro): Record<string, unknown> {
  const p: Record<string, unknown> = {
    tipo: TIPOS_REGISTRO_MTE.some((t) => t.chave === d.tipo)
      ? d.tipo
      : "registro_sindical",
    numero: d.numero,
    categoria: d.categoria,
    abrangencia: d.abrangencia,
    data_registro: d.data_registro,
    data_publicacao: d.data_publicacao,
    situacao: SITUACOES_REGISTRO_MTE.some((s) => s.chave === d.situacao)
      ? d.situacao
      : "ativo",
    observacoes: d.observacoes,
    updated_at: new Date().toISOString(),
  }
  if (d.documento_url !== undefined) p.documento_url = d.documento_url
  return p
}

export async function criarRegistro(
  dados: DadosRegistro
): Promise<{ id?: string; erro?: string }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("registro_sindical")
    .insert({ ...payload(dados), emp_proprietaria_id: empId })
    .select("id")
    .single()
  if (error) return { erro: `Falha ao criar o registro: ${error.message}` }
  return { id: String(data.id) }
}

export async function atualizarRegistro(
  id: string,
  dados: DadosRegistro
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("registro_sindical")
    .update(payload(dados))
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao salvar o registro: ${error.message}` }
  return {}
}

export async function subirDocumentoRegistro(
  arquivo: File
): Promise<{ caminho?: string; erro?: string }> {
  if (arquivo.type !== "application/pdf") {
    return { erro: "O documento deve ser um PDF." }
  }
  const admin = await createAdminClient()
  const caminho = `registro-mte/${randomUUID()}.pdf`
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(caminho, arquivo, { contentType: "application/pdf", upsert: false })
  if (error) return { erro: `Falha ao subir o documento: ${error.message}` }
  return { caminho }
}

export async function excluirRegistro(id: string): Promise<{ erro?: string }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data: r } = await admin
    .from("registro_sindical")
    .select("documento_url")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  const { error } = await admin
    .from("registro_sindical")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Falha ao excluir o registro: ${error.message}` }
  const caminho = texto(r?.documento_url)
  if (caminho) await admin.storage.from(BUCKET).remove([caminho])
  return {}
}
