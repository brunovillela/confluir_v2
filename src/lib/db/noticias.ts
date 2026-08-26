import "server-only"
import { texto } from "@/lib/db/comum"
import { randomUUID } from "node:crypto"

import { tenantAtual } from "@/lib/tenant"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Notícias — gestão (lado admin). A LEITURA (widget do painel, /portal/noticias
 * e a página /painel/noticias/[id]) vive em db/painel.ts (ultimasNoticias /
 * buscarNoticia). Aqui ficam a lista de gestão e o CRUD. A tabela `noticias`
 * é tenant-owned desde supabase/noticias.sql (RLS + trigger de emp); a imagem
 * vai para o bucket PÚBLICO `noticias` (aparece no portal — não é sigilosa).
 */

const TAMANHO_MAX = 5 * 1024 * 1024 // 5 MB

export type NoticiaLista = {
  id: string
  manchete: string | null
  imagem: string | null
  created_at: string | null
}

export async function listarNoticias(busca?: string): Promise<NoticiaLista[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("noticias")
    .select("id, manchete, imagem, created_at")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(500)
  if (error) throw new Error(`Falha ao listar notícias: ${error.message}`)

  const termo = (busca ?? "").trim().toLocaleLowerCase("pt-BR")
  return (data ?? [])
    .map((n) => ({
      id: String(n.id),
      manchete: texto(n.manchete),
      imagem: texto(n.imagem),
      created_at: texto(n.created_at),
    }))
    .filter(
      (n) =>
        !termo || (n.manchete ?? "").toLocaleLowerCase("pt-BR").includes(termo)
    )
}

/** Sobe a imagem no bucket público e devolve a URL pública. */
async function subirImagem(
  arquivo: File
): Promise<{ url?: string; erro?: string }> {
  if (!arquivo.type.startsWith("image/")) {
    return { erro: "O arquivo precisa ser uma imagem." }
  }
  if (arquivo.size > TAMANHO_MAX) {
    return { erro: "A imagem deve ter no máximo 5 MB." }
  }
  const admin = await createAdminClient()
  const ext = (arquivo.name.split(".").pop() || "jpg").toLowerCase()
  const caminho = `${randomUUID()}.${ext}`
  const { error } = await admin.storage
    .from("noticias")
    .upload(caminho, arquivo, {
      contentType: arquivo.type || undefined,
      upsert: false,
    })
  if (error) return { erro: `Falha ao subir a imagem: ${error.message}` }
  const { data } = admin.storage.from("noticias").getPublicUrl(caminho)
  return { url: data.publicUrl }
}

export type DadosNoticia = {
  manchete: string
  noticia: string | null
  /** File nova (sobe e substitui). Sem arquivo = mantém a imagem atual. */
  imagemArquivo?: File | null
}

export async function criarNoticia(
  dados: DadosNoticia
): Promise<{ id?: string; erro?: string }> {
  const manchete = dados.manchete.trim()
  if (!manchete) return { erro: "Informe a manchete." }

  let imagem: string | null = null
  if (dados.imagemArquivo && dados.imagemArquivo.size > 0) {
    const { url, erro } = await subirImagem(dados.imagemArquivo)
    if (erro) return { erro }
    imagem = url ?? null
  }

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("noticias")
    .insert({
      manchete,
      noticia: dados.noticia,
      imagem,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error) {
    if (["PGRST204", "42703"].includes(error.code ?? "")) {
      return { erro: "Rode supabase/noticias.sql antes de publicar notícias." }
    }
    return { erro: `Falha ao publicar a notícia: ${error.message}` }
  }
  return { id: String(data.id) }
}

export async function atualizarNoticia(
  id: string,
  dados: DadosNoticia
): Promise<{ erro?: string }> {
  const manchete = dados.manchete.trim()
  if (!manchete) return { erro: "Informe a manchete." }

  const patch: Record<string, unknown> = {
    manchete,
    noticia: dados.noticia,
  }
  if (dados.imagemArquivo && dados.imagemArquivo.size > 0) {
    const { url, erro } = await subirImagem(dados.imagemArquivo)
    if (erro) return { erro }
    patch.imagem = url
  }

  const admin = await createAdminClient()
  const { error } = await admin
    .from("noticias")
    .update(patch)
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao salvar a notícia: ${error.message}` }
  return {}
}

export async function excluirNoticia(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("noticias")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao excluir a notícia: ${error.message}` }
  return {}
}
