import "server-only"
import { texto } from "@/lib/db/comum"
import { randomUUID } from "node:crypto"

import { tenantAtual } from "@/lib/tenant"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Documentos institucionais (FA Documentos). Modelo:
 *   fa_documentos (29)  ──<  fa_documentos_versao (67, arquivos)
 *   fa_documentos  >──<  fa_documentos_categorias (4)  via junction
 *
 * ARMADILHA DE SCHEMA: `fa_documentos_versao.documento_id` tem FK para
 * `pessoal_treinamentos` (erro da migração) e está nula em todas as linhas. O
 * vínculo real versão→documento é `fa_documentos_versao.documento_raw`
 * (bubble_id) → `fa_documentos.bubble_id`. Só a JUNCTION de categorias usa o
 * id real (`fa_documentos.id`).
 *
 * Arquivos migrados do CDN do Bubble para o bucket `documentos` em 2026-07-21;
 * `arquivo_url` guarda o caminho no bucket (ou, para eventual legado, uma URL
 * externa — ver `urlArquivoDocumento`).
 */

/** URL para abrir/baixar o arquivo: externa passa direto; caminho vira signed URL. */
export async function urlArquivoDocumento(
  caminho: string | null
): Promise<string | null> {
  if (!caminho) return null
  if (/^(https?:)?\/\//.test(caminho)) {
    return caminho.startsWith("//") ? `https:${caminho}` : caminho
  }
  const admin = await createAdminClient()
  const { data } = await admin.storage
    .from("documentos")
    .createSignedUrl(caminho, 3600)
  return data?.signedUrl ?? null
}

// ── Listagem ────────────────────────────────────────────────────────────────

export type DocumentoLinha = {
  id: string
  documento: string | null
  categorias: string[]
  versoes: number
  atualizadoEm: string | null
}

export async function listarDocumentos(filtro: {
  busca?: string
  categoriaId?: string
} = {}): Promise<DocumentoLinha[]> {
  const admin = await createAdminClient()

  const { data: docs } = await admin
    .from("fa_documentos")
    .select("id, bubble_id, documento, modified_at")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("documento", { ascending: true })

  const documentos = docs ?? []
  if (documentos.length === 0) return []

  // Categorias por documento (junction usa o id real).
  const idsDocs = documentos.map((d) => d.id)
  const [{ data: junction }, { data: cats }, { data: versoes }] =
    await Promise.all([
      admin
        .from("fa_documentos_categorias_junction")
        .select("documento_id, categoria_id")
        .in("documento_id", idsDocs),
      admin.from("fa_documentos_categorias").select("id, nome"),
      admin
        .from("fa_documentos_versao")
        .select("documento_raw, created_at"),
    ])

  const nomeCategoria = new Map(
    (cats ?? []).map((c) => [c.id as string, texto(c.nome)])
  )
  const categoriasPorDoc = new Map<string, string[]>()
  const categoriaIdsPorDoc = new Map<string, Set<string>>()
  for (const j of junction ?? []) {
    const docId = j.documento_id as string
    const catId = j.categoria_id as string
    const nome = nomeCategoria.get(catId)
    if (nome) {
      const lista = categoriasPorDoc.get(docId) ?? []
      lista.push(nome)
      categoriasPorDoc.set(docId, lista)
    }
    const setIds = categoriaIdsPorDoc.get(docId) ?? new Set<string>()
    setIds.add(catId)
    categoriaIdsPorDoc.set(docId, setIds)
  }

  // Versões contadas e data mais recente por bubble_id do documento.
  const versoesPorBubble = new Map<string, { n: number; ultima: string | null }>()
  for (const v of versoes ?? []) {
    const raw = v.documento_raw as string | null
    if (!raw) continue
    const atual = versoesPorBubble.get(raw) ?? { n: 0, ultima: null }
    atual.n += 1
    const c = texto(v.created_at)
    if (c && (!atual.ultima || c > atual.ultima)) atual.ultima = c
    versoesPorBubble.set(raw, atual)
  }

  const busca = (filtro.busca ?? "").trim().toLowerCase()

  return documentos
    .filter((d) => {
      if (filtro.categoriaId) {
        const setIds = categoriaIdsPorDoc.get(d.id)
        if (!setIds || !setIds.has(filtro.categoriaId)) return false
      }
      if (busca) {
        return (d.documento ?? "").toLowerCase().includes(busca)
      }
      return true
    })
    .map((d) => {
      const v = versoesPorBubble.get(d.bubble_id as string)
      return {
        id: d.id as string,
        documento: texto(d.documento),
        categorias: categoriasPorDoc.get(d.id) ?? [],
        versoes: v?.n ?? 0,
        atualizadoEm: v?.ultima ?? texto(d.modified_at),
      }
    })
}

export async function listarCategoriasDocumentos(): Promise<
  { id: string; nome: string }[]
> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("fa_documentos_categorias")
    .select("id, nome")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("nome", { ascending: true })
  return (data ?? [])
    .map((c) => ({ id: c.id as string, nome: texto(c.nome) ?? "(sem nome)" }))
}

// ── Detalhe ─────────────────────────────────────────────────────────────────

export type VersaoDocumento = {
  id: string
  nome: string | null
  arquivoUrl: string | null
  vigenciaInicio: string | null
  vigenciaTermino: string | null
  semVigencia: boolean
  criadoEm: string | null
}

export type DetalheDocumento = {
  id: string
  documento: string | null
  categorias: string[]
  categoriaIds: string[]
  versoes: VersaoDocumento[]
}

export async function obterDocumento(
  id: string
): Promise<DetalheDocumento | null> {
  const admin = await createAdminClient()
  const { data: doc } = await admin
    .from("fa_documentos")
    .select("id, bubble_id, documento")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!doc) return null

  const [{ data: junction }, { data: cats }, { data: versoes }] =
    await Promise.all([
      admin
        .from("fa_documentos_categorias_junction")
        .select("categoria_id")
        .eq("documento_id", id),
      admin.from("fa_documentos_categorias").select("id, nome"),
      admin
        .from("fa_documentos_versao")
        .select(
          "id, nome, arquivo_url, vigencia_inicio, vigencia_termino, sem_vigencia, created_at"
        )
        .eq("documento_raw", doc.bubble_id)
        .order("created_at", { ascending: false }),
    ])

  const nomeCategoria = new Map(
    (cats ?? []).map((c) => [c.id as string, texto(c.nome)])
  )
  const categoriaIds = (junction ?? []).map((j) => j.categoria_id as string)
  const categorias = categoriaIds
    .map((id) => nomeCategoria.get(id))
    .filter((n): n is string => !!n)

  // Assina as URLs em paralelo.
  const versoesComUrl = await Promise.all(
    (versoes ?? []).map(async (v) => ({
      id: v.id as string,
      nome: texto(v.nome),
      arquivoUrl: await urlArquivoDocumento(texto(v.arquivo_url)),
      vigenciaInicio: texto(v.vigencia_inicio),
      vigenciaTermino: texto(v.vigencia_termino),
      semVigencia: v.sem_vigencia === true,
      criadoEm: texto(v.created_at),
    }))
  )

  return {
    id: doc.id as string,
    documento: texto(doc.documento),
    categorias,
    categoriaIds,
    versoes: versoesComUrl,
  }
}

// ── Escrita ──────────────────────────────────────────────────────────────────

/** True se o valor é um caminho no bucket (e não uma URL externa legada). */
function ehCaminhoBucket(url: string | null): url is string {
  return !!url && !/^(https?:)?\/\//.test(url)
}

/** Sobe um PDF no bucket 'documentos' e devolve o caminho gravável. */
export async function subirPdfDocumento(
  documentoId: string,
  arquivo: File
): Promise<{ caminho?: string; erro?: string }> {
  if (arquivo.type !== "application/pdf") {
    return { erro: "O arquivo deve ser um PDF." }
  }
  if (arquivo.size > 20 * 1024 * 1024) {
    return { erro: "O arquivo deve ter no máximo 20 MB." }
  }
  const caminho = `${documentoId}/${randomUUID()}.pdf`
  const admin = await createAdminClient()
  const { error } = await admin.storage
    .from("documentos")
    .upload(caminho, arquivo, { contentType: "application/pdf" })
  if (error) return { erro: `Falha ao subir o arquivo: ${error.message}` }
  return { caminho }
}

/** Substitui as categorias de um documento (delete + insert na junction). */
async function definirCategorias(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  documentoId: string,
  categoriaIds: string[]
): Promise<void> {
  await admin
    .from("fa_documentos_categorias_junction")
    .delete()
    .eq("documento_id", documentoId)
  const limpos = [...new Set(categoriaIds.filter(Boolean))]
  if (limpos.length === 0) return
  await admin.from("fa_documentos_categorias_junction").insert(
    limpos.map((categoria_id) => ({ documento_id: documentoId, categoria_id }))
  )
}

export type DadosDocumento = {
  documento: string | null
  categoriaIds: string[]
}

export async function criarDocumento(
  dados: DadosDocumento
): Promise<{ id?: string; erro?: string }> {
  const titulo = (dados.documento ?? "").trim()
  if (!titulo) return { erro: "Informe o título do documento." }
  const admin = await createAdminClient()
  // `bubble_id` é a CHAVE de junção usada pelas versões (documento_raw) e pela
  // leitura — geramos uma para documentos novos (os migrados já têm a sua).
  const { data, error } = await admin
    .from("fa_documentos")
    .insert({
      documento: titulo,
      bubble_id: `app-${randomUUID()}`,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error) return { erro: `Não foi possível criar o documento: ${error.message}` }
  await definirCategorias(admin, data.id as string, dados.categoriaIds)
  return { id: data.id as string }
}

export async function atualizarDocumento(
  id: string,
  dados: DadosDocumento
): Promise<{ erro?: string }> {
  const titulo = (dados.documento ?? "").trim()
  if (!titulo) return { erro: "Informe o título do documento." }
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("fa_documentos")
    .update({ documento: titulo, modified_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .select("id")
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if ((data ?? []).length === 0) return { erro: "Documento não encontrado." }
  await definirCategorias(admin, id, dados.categoriaIds)
  return {}
}

/** Exclui o documento, suas versões (arquivos no bucket) e os vínculos. */
export async function excluirDocumento(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: doc } = await admin
    .from("fa_documentos")
    .select("id, bubble_id")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!doc) return { erro: "Documento não encontrado." }

  const { data: versoes } = await admin
    .from("fa_documentos_versao")
    .select("id, arquivo_url")
    .eq("documento_raw", doc.bubble_id)
  const caminhos = (versoes ?? [])
    .map((v) => texto(v.arquivo_url))
    .filter(ehCaminhoBucket)
  if (caminhos.length > 0) {
    await admin.storage.from("documentos").remove(caminhos)
  }
  await admin
    .from("fa_documentos_versao")
    .delete()
    .eq("documento_raw", doc.bubble_id)
  await admin
    .from("fa_documentos_categorias_junction")
    .delete()
    .eq("documento_id", id)
  const { error } = await admin.from("fa_documentos").delete().eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  return {}
}

// ── Versões ──────────────────────────────────────────────────────────────────

export type DadosVersao = {
  nome: string | null
  /** Caminho já subido (subirPdfDocumento). */
  arquivo_url: string
  vigencia_inicio: string | null
  vigencia_termino: string | null
  sem_vigencia: boolean
}

export async function criarVersaoDocumento(
  documentoId: string,
  dados: DadosVersao
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: doc } = await admin
    .from("fa_documentos")
    .select("bubble_id")
    .eq("id", documentoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!doc) return { erro: "Documento não encontrado." }

  const { error } = await admin.from("fa_documentos_versao").insert({
    nome: (dados.nome ?? "").trim() || null,
    arquivo_url: dados.arquivo_url,
    documento_raw: doc.bubble_id, // vínculo real versão→documento
    vigencia_inicio: dados.vigencia_inicio,
    vigencia_termino: dados.vigencia_termino,
    sem_vigencia: dados.sem_vigencia,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível salvar a versão: ${error.message}` }
  return {}
}

export async function excluirVersaoDocumento(
  versaoId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: v } = await admin
    .from("fa_documentos_versao")
    .select("id, arquivo_url")
    .eq("id", versaoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!v) return { erro: "Versão não encontrada." }
  const caminho = texto(v.arquivo_url)
  if (ehCaminhoBucket(caminho)) {
    await admin.storage.from("documentos").remove([caminho])
  }
  const { error } = await admin
    .from("fa_documentos_versao")
    .delete()
    .eq("id", versaoId)
  if (error) return { erro: `Não foi possível excluir a versão: ${error.message}` }
  return {}
}

// ── Categorias (CRUD) ────────────────────────────────────────────────────────

export type CategoriaDocumento = {
  id: string
  nome: string | null
  usos: number
}

/** Categorias do tenant com a contagem de documentos que as usam. */
export async function listarCategoriasDocumentosComUso(): Promise<
  CategoriaDocumento[]
> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const [catRes, junRes] = await Promise.all([
    admin
      .from("fa_documentos_categorias")
      .select("id, nome")
      .eq("emp_proprietaria_id", empId)
      .order("nome", { ascending: true }),
    admin.from("fa_documentos_categorias_junction").select("categoria_id"),
  ])
  const usos = new Map<string, number>()
  for (const j of junRes.data ?? []) {
    const cid = j.categoria_id as string
    if (cid) usos.set(cid, (usos.get(cid) ?? 0) + 1)
  }
  return (catRes.data ?? []).map((c) => ({
    id: c.id as string,
    nome: texto(c.nome),
    usos: usos.get(c.id as string) ?? 0,
  }))
}

export async function criarCategoriaDocumento(
  nome: string
): Promise<{ erro?: string }> {
  const limpo = nome.trim()
  if (!limpo) return { erro: "Informe o nome da categoria." }
  const admin = await createAdminClient()
  const { error } = await admin.from("fa_documentos_categorias").insert({
    nome: limpo,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível criar: ${error.message}` }
  return {}
}

export async function atualizarCategoriaDocumento(
  id: string,
  nome: string
): Promise<{ erro?: string }> {
  const limpo = nome.trim()
  if (!limpo) return { erro: "Informe o nome da categoria." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("fa_documentos_categorias")
    .update({ nome: limpo, modified_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  return {}
}

export async function excluirCategoriaDocumento(
  id: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { count } = await admin
    .from("fa_documentos_categorias_junction")
    .select("categoria_id", { count: "exact", head: true })
    .eq("categoria_id", id)
  if ((count ?? 0) > 0) {
    return {
      erro: `Categoria em uso por ${count} documento(s) — remova o vínculo antes de excluir.`,
    }
  }
  const { error } = await admin
    .from("fa_documentos_categorias")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  return {}
}
