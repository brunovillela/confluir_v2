import "server-only"
import { lerEmLotes, texto } from "@/lib/db/comum"
import { randomUUID } from "node:crypto"

import { depoisDaResposta } from "@/lib/db/avisos"
import { avisarAtivosNoSino, removerAvisosDoLink } from "@/lib/db/portal-avisos"
import { paginar, type Paginacao } from "@/lib/paginacao"
import { tenantAtual } from "@/lib/tenant"
import { createAdminClient } from "@/lib/supabase/admin"
import { semAcento } from "@/lib/texto"

/**
 * Notícias — gestão (lado admin). A LEITURA do widget do painel e das páginas
 * de leitura (/painel/…/noticias/[id], /portal/noticias/[id]) vive em
 * db/painel.ts (ultimasNoticias / buscarNoticia). Aqui ficam a lista de
 * gestão, a lista paginada do portal (listarNoticiasPortal) e o CRUD. A tabela `noticias`
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

export type NoticiaPortal = {
  id: string
  manchete: string
  /** URL pronta para o <img> (as do Bubble chegam sem protocolo). */
  imagem: string | null
  created_at: string | null
  /** Primeiras linhas do texto, sem quebras, cortadas na palavra. */
  resumo: string | null
}

/** Imagens migradas do Bubble vêm protocolo-relativas (//cdn…). */
function urlDaImagem(imagem: string | null): string | null {
  return imagem?.startsWith("//") ? `https:${imagem}` : imagem
}

const DATA_SP = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

/**
 * "02/08/2026" no calendário de São Paulo, com o ano (A86). `formatarData`
 * lê a data UTC de um timestamp: a notícia publicada depois das 21h sairia
 * com o dia seguinte — e diferente do widget do Início, que já usa São Paulo.
 */
export function dataDaNoticia(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : DATA_SP.format(d)
}

/** Começo do texto da notícia: sem tags nem quebras, cortado na palavra. */
export function resumir(textoBruto: string | null, max = 160): string | null {
  const limpo = (textoBruto ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  if (!limpo) return null
  if (limpo.length <= max) return limpo
  const corte = limpo.slice(0, max)
  const espaco = corte.lastIndexOf(" ")
  return `${(espaco > max * 0.6 ? corte.slice(0, espaco) : corte).replace(/[\s.,;:—-]+$/, "")}…`
}

/**
 * Notícias do portal do associado (A86), paginadas e com busca na manchete.
 * A lista inteira vem leve (sem o texto) e em lotes — o PostgREST para em
 * 1.000 linhas; a busca, sem acento, e o fatiamento são em memória, como nas
 * outras listas do portal. O texto só é lido para as notícias da página, de
 * onde sai o resumo.
 */
export async function listarNoticiasPortal(opcoes: {
  busca?: string
  paginacao: Paginacao
}): Promise<{
  noticias: NoticiaPortal[]
  pagina: number
  totalPaginas: number
  total: number
  /** Data da notícia mais recente da entidade, com ou sem busca — a marca de "já vi até aqui" (A123). */
  maisRecente: string | null
}> {
  const admin = await createAdminClient()
  const tenant = await tenantAtual()
  const linhas = await lerEmLotes((de, ate) =>
    admin
      .from("noticias")
      .select("id, manchete, imagem, created_at")
      .eq("emp_proprietaria_id", tenant)
      .order("created_at", { ascending: false, nullsFirst: false })
      .order("id")
      .range(de, ate)
  )

  const termo = semAcento(opcoes.busca ?? "")
  const todas = linhas
    .map((n) => ({
      id: String(n.id),
      manchete: texto(n.manchete),
      imagem: urlDaImagem(texto(n.imagem)),
      created_at: texto(n.created_at),
    }))
    // Sem manchete não há o que listar nem onde clicar (como no widget).
    .filter((n): n is typeof n & { manchete: string } => n.manchete !== null)
    .filter((n) => !termo || semAcento(n.manchete).includes(termo))

  const { linhas: pagina, ...info } = paginar(todas, opcoes.paginacao)
  const resumos = new Map<string, string | null>()
  if (pagina.length > 0) {
    const { data } = await admin
      .from("noticias")
      .select("id, noticia")
      .eq("emp_proprietaria_id", tenant)
      .in(
        "id",
        pagina.map((n) => n.id)
      )
    for (const n of data ?? []) resumos.set(String(n.id), resumir(texto(n.noticia)))
  }

  return {
    ...info,
    noticias: pagina.map((n) => ({ ...n, resumo: resumos.get(n.id) ?? null })),
    // A lista vem do banco da mais nova para a mais antiga (datas nulas no fim).
    maisRecente: texto(linhas.find((n) => texto(n.created_at))?.created_at),
  }
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
  const id = String(data.id)
  // A123: notícia nova vai para o sino dos filiados ativos, depois da
  // resposta — quem publica não espera milhares de linhas. Só sino (e celular
  // de quem ligou "Notícias e convênios"); e-mail é com a mala direta.
  depoisDaResposta(() =>
    avisarAtivosNoSino({
      evento: "noticias",
      texto: `Notícia nova: ${manchete.length > 200 ? `${manchete.slice(0, 199)}…` : manchete}`,
      link: linkDaNoticia(id),
      assunto: "Notícia nova",
    })
  )
  return { id }
}

/** Onde o associado lê a notícia — também a trava de "um aviso por notícia". */
export function linkDaNoticia(id: string): string {
  return `/portal/noticias/${id}`
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
  // O aviso do sino levaria a uma página que não existe mais.
  depoisDaResposta(() => removerAvisosDoLink(linkDaNoticia(id)))
  return {}
}
