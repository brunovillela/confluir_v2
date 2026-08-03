import "server-only"
import { randomUUID } from "node:crypto"

import { tenantAtual } from "@/lib/tenant"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  TIPOS_DOC_REPRESENTACAO,
  type TipoDocRepresentacao,
} from "@/lib/representacao-docs-constantes"

/**
 * Documentação legal do empregador (representação sindical): cartas, atas,
 * editais, procurações etc. anexados a uma linha de `empresa`. Arquivos no
 * bucket privado `representacao`. Espelha o padrão de `db/acordos.ts`.
 */

const BUCKET = "representacao"

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null
}

export type DocumentoRepresentacao = {
  id: string
  tipo: TipoDocRepresentacao
  titulo: string | null
  numero: string | null
  data_documento: string | null
  vigencia_fim: string | null
  observacoes: string | null
  arquivoUrl: string | null
}

export async function listarDocumentosEmpregador(
  empresaId: string
): Promise<DocumentoRepresentacao[]> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("representacao_documentos")
    .select(
      "id, tipo, titulo, numero, data_documento, vigencia_fim, observacoes, arquivo_url"
    )
    .eq("empresa_id", empresaId)
    .eq("emp_proprietaria_id", empId)
    .order("data_documento", { ascending: false, nullsFirst: false })
  if (error) throw new Error(`Falha ao listar documentos: ${error.message}`)

  const docs: DocumentoRepresentacao[] = []
  for (const d of data ?? []) {
    let arquivoUrl: string | null = null
    const caminho = texto(d.arquivo_url)
    if (caminho) {
      const { data: s } = await admin.storage
        .from(BUCKET)
        .createSignedUrl(caminho, 3600)
      arquivoUrl = s?.signedUrl ?? null
    }
    docs.push({
      id: String(d.id),
      tipo: (d.tipo ?? "outro") as TipoDocRepresentacao,
      titulo: texto(d.titulo),
      numero: texto(d.numero),
      data_documento: texto(d.data_documento),
      vigencia_fim: texto(d.vigencia_fim),
      observacoes: texto(d.observacoes),
      arquivoUrl,
    })
  }
  return docs
}

export type DadosDocumento = {
  tipo: TipoDocRepresentacao
  titulo: string | null
  numero: string | null
  data_documento: string | null
  vigencia_fim: string | null
  observacoes: string | null
}

export async function subirArquivoDocumento(
  arquivo: File
): Promise<{ caminho?: string; erro?: string }> {
  if (arquivo.type !== "application/pdf") {
    return { erro: "O documento deve ser um PDF." }
  }
  const admin = await createAdminClient()
  const caminho = `documentos/${randomUUID()}.pdf`
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(caminho, arquivo, { contentType: "application/pdf", upsert: false })
  if (error) return { erro: `Falha ao subir o documento: ${error.message}` }
  return { caminho }
}

export async function adicionarDocumento(
  empresaId: string,
  dados: DadosDocumento,
  arquivoCaminho: string | null
): Promise<{ erro?: string }> {
  if (!dados.titulo?.trim()) return { erro: "Informe o título do documento." }
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { error } = await admin.from("representacao_documentos").insert({
    empresa_id: empresaId,
    tipo: TIPOS_DOC_REPRESENTACAO.some((t) => t.chave === dados.tipo)
      ? dados.tipo
      : "outro",
    titulo: dados.titulo,
    numero: dados.numero,
    data_documento: dados.data_documento,
    vigencia_fim: dados.vigencia_fim,
    observacoes: dados.observacoes,
    arquivo_url: arquivoCaminho,
    emp_proprietaria_id: empId,
  })
  if (error) return { erro: `Falha ao adicionar o documento: ${error.message}` }
  return {}
}

export async function excluirDocumento(id: string): Promise<{ erro?: string }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data: doc } = await admin
    .from("representacao_documentos")
    .select("arquivo_url")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  const { error } = await admin
    .from("representacao_documentos")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Falha ao excluir o documento: ${error.message}` }
  const caminho = texto(doc?.arquivo_url)
  if (caminho) await admin.storage.from(BUCKET).remove([caminho])
  return {}
}
