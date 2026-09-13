import "server-only"

import { createHash, randomUUID } from "node:crypto"

import { esquemaAusente, hojeSP, texto } from "@/lib/db/comum"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { ultimasNoticias } from "@/lib/db/painel"
import {
  DURACAO_PADRAO,
  ehAjuste,
  ehGiro,
  ehOrientacao,
  itensDaFaixa,
  situacaoDoSlide,
  slideTemConteudo,
  type Giro,
  type Orientacao,
  type SlideTv,
} from "@/lib/comunicacao-slides-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Comunicação › Slides para TV — leitura, imagens e a montagem da tela
 * pública. Escrita dos registros nas actions da rota do painel.
 *
 * Cada conjunto tem um link público /tv/<slug> (sem login, tenant pelo host).
 * A TV confere /tv/<slug>/versao a cada minuto e recarrega quando a versão
 * muda — a versão é um hash de TUDO o que está na tela.
 *
 * SQL: supabase/comunicacao-slides-tv.sql
 */

export const BUCKET_SLIDES = "comunicacao"
const TAMANHO_MAX = 3.5 * 1024 * 1024 // o corpo da server action vai até 4 MB
const TIPOS_IMAGEM: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
}

export type ConjuntoSlides = {
  id: string
  nome: string
  slug: string
  orientacao: Orientacao
  girar: Giro
  duracaoSegundos: number
  mostrarLogo: boolean
  opacidadeLogo: number
  faixaAtiva: boolean
  faixaNoticias: boolean
  faixaQuantidade: number
  faixaTexto: string | null
  mostrarRelogio: boolean
  publicado: boolean
  ultimoAcesso: string | null
  createdAt: string
}

const COLUNAS_CONJUNTO =
  "id, nome, slug, orientacao, girar, duracao_segundos, mostrar_logo, opacidade_logo, faixa_ativa, faixa_noticias, faixa_quantidade, faixa_texto, mostrar_relogio, publicado, ultimo_acesso, created_at"

function paraConjunto(l: Record<string, unknown>): ConjuntoSlides {
  return {
    id: String(l.id),
    nome: texto(l.nome) ?? "Conjunto sem nome",
    slug: String(l.slug ?? ""),
    orientacao: ehOrientacao(l.orientacao) ? l.orientacao : "horizontal",
    girar: ehGiro(l.girar) ? l.girar : "nao",
    duracaoSegundos: Number(l.duracao_segundos) || DURACAO_PADRAO,
    mostrarLogo: l.mostrar_logo !== false,
    opacidadeLogo: Number.isFinite(Number(l.opacidade_logo)) ? Number(l.opacidade_logo) : 70,
    faixaAtiva: l.faixa_ativa !== false,
    faixaNoticias: l.faixa_noticias !== false,
    faixaQuantidade: Number(l.faixa_quantidade) || 8,
    faixaTexto: texto(l.faixa_texto),
    mostrarRelogio: l.mostrar_relogio !== false,
    publicado: l.publicado !== false,
    ultimoAcesso: texto(l.ultimo_acesso),
    createdAt: String(l.created_at ?? ""),
  }
}

const COLUNAS_SLIDE =
  "id, ordem, titulo, descricao, imagem_url, imagem_caminho, ajuste, duracao_segundos, exibir_de, exibir_ate, ativo"

function paraSlide(l: Record<string, unknown>): SlideTv {
  const duracao = Number(l.duracao_segundos)
  return {
    id: String(l.id),
    ordem: Number(l.ordem) || 0,
    titulo: texto(l.titulo),
    descricao: texto(l.descricao),
    imagemUrl: texto(l.imagem_url),
    imagemCaminho: texto(l.imagem_caminho),
    ajuste: ehAjuste(l.ajuste) ? l.ajuste : "cobrir",
    duracaoSegundos: l.duracao_segundos == null || !duracao ? null : duracao,
    exibirDe: texto(l.exibir_de),
    exibirAte: texto(l.exibir_ate),
    ativo: l.ativo !== false,
  }
}

export type ConjuntoNaLista = ConjuntoSlides & { totalSlides: number; noAr: number }

/** ativo=false → tabelas ainda não criadas (rodar o SQL). */
export async function listarConjuntosSlides(): Promise<{
  ativo: boolean
  conjuntos: ConjuntoNaLista[]
}> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("comunicacao_slides_conjuntos")
    .select(COLUNAS_CONJUNTO)
    .eq("emp_proprietaria_id", emp)
    .order("created_at", { ascending: false })
  if (error) {
    if (esquemaAusente(error)) return { ativo: false, conjuntos: [] }
    throw new Error(`Falha ao listar os conjuntos de slides: ${error.message}`)
  }
  const ids = (data ?? []).map((c) => String(c.id))
  const { data: slides } = ids.length
    ? await admin
        .from("comunicacao_slides")
        .select("conjunto_id, ativo, exibir_de, exibir_ate")
        .in("conjunto_id", ids)
    : { data: [] }
  const hoje = hojeSP()
  const contagem = new Map<string, { total: number; noAr: number }>()
  for (const s of slides ?? []) {
    const c = contagem.get(String(s.conjunto_id)) ?? { total: 0, noAr: 0 }
    c.total++
    const situacao = situacaoDoSlide(
      {
        ativo: s.ativo !== false,
        exibirDe: texto(s.exibir_de),
        exibirAte: texto(s.exibir_ate),
      },
      hoje
    )
    if (situacao === "no_ar") c.noAr++
    contagem.set(String(s.conjunto_id), c)
  }
  return {
    ativo: true,
    conjuntos: (data ?? []).map((l) => {
      const c = paraConjunto(l)
      const n = contagem.get(c.id)
      return { ...c, totalSlides: n?.total ?? 0, noAr: n?.noAr ?? 0 }
    }),
  }
}

export async function buscarConjuntoSlides(
  id: string
): Promise<{ conjunto: ConjuntoSlides; slides: SlideTv[] } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("comunicacao_slides_conjuntos")
    .select(COLUNAS_CONJUNTO)
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (error || !data) return null
  const { data: slides } = await admin
    .from("comunicacao_slides")
    .select(COLUNAS_SLIDE)
    .eq("conjunto_id", id)
    .eq("emp_proprietaria_id", emp)
    .order("ordem", { ascending: true })
    .order("created_at", { ascending: true })
  return { conjunto: paraConjunto(data), slides: (slides ?? []).map(paraSlide) }
}

export async function buscarSlide(
  id: string
): Promise<(SlideTv & { conjuntoId: string }) | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const admin = await createAdminClient()
  const { data } = await admin
    .from("comunicacao_slides")
    .select(`${COLUNAS_SLIDE}, conjunto_id`)
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!data) return null
  return { ...paraSlide(data), conjuntoId: String(data.conjunto_id) }
}

// ── Imagens ──────────────────────────────────────────────────────────────────

/** Sobe a imagem no bucket público. A tela do painel já reduz antes de enviar. */
export async function subirImagemSlide(
  arquivo: File
): Promise<{ caminho: string; url: string } | { erro: string }> {
  const ext = TIPOS_IMAGEM[arquivo.type]
  if (!ext) return { erro: "Use uma imagem JPG, PNG, WebP ou GIF." }
  if (arquivo.size > TAMANHO_MAX) {
    return { erro: "A imagem passou de 3,5 MB. Reduza o tamanho e tente de novo." }
  }
  const admin = await createAdminClient()
  const caminho = `slides/${await tenantAtual()}/${randomUUID()}.${ext}`
  const { error } = await admin.storage.from(BUCKET_SLIDES).upload(caminho, arquivo, {
    contentType: arquivo.type,
    cacheControl: "31536000",
    upsert: false,
  })
  if (error) {
    if (/bucket not found/i.test(error.message)) {
      return { erro: "Rode supabase/comunicacao-slides-tv.sql no Supabase: falta o bucket das imagens." }
    }
    return { erro: `Falha ao subir a imagem: ${error.message}` }
  }
  const { data } = admin.storage.from(BUCKET_SLIDES).getPublicUrl(caminho)
  return { caminho, url: data.publicUrl }
}

/** Apaga imagens do bucket — só as do próprio tenant. */
export async function removerImagensSlides(caminhos: (string | null)[]): Promise<void> {
  const prefixo = `slides/${await tenantAtual()}/`
  const nossos = caminhos.filter((c): c is string => !!c && c.startsWith(prefixo))
  if (nossos.length === 0) return
  const admin = await createAdminClient()
  await admin.storage.from(BUCKET_SLIDES).remove(nossos)
}

// ── Tela pública ─────────────────────────────────────────────────────────────

export type ExibicaoTv =
  | {
      estado: "ok"
      versao: string
      nomeEntidade: string
      logoUrl: string | null
      conjunto: ConjuntoSlides
      slides: SlideTv[]
      faixa: string[]
    }
  | {
      estado: "despublicado" | "inexistente"
      versao: string
      nomeEntidade: string
      logoUrl: string | null
    }

function hashDe(v: unknown): string {
  return createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16)
}

/**
 * O que a TV deve mostrar agora. `registrarAcesso` grava a última conexão —
 * a prévia do painel não registra, para não parecer que há uma TV ligada.
 */
export async function exibicaoDoLink(
  slug: string,
  { registrarAcesso }: { registrarAcesso: boolean }
): Promise<ExibicaoTv> {
  const organizacao = await obterOrganizacao().catch(() => null)
  const nomeEntidade = organizacao?.nomeFantasia ?? organizacao?.nomeRazao ?? "Confluir"
  const logoUrl = organizacao?.logoUrl ?? null

  if (!/^[a-z0-9]{6,32}$/.test(slug)) {
    return { estado: "inexistente", versao: "inexistente", nomeEntidade, logoUrl }
  }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("comunicacao_slides_conjuntos")
    .select(COLUNAS_CONJUNTO)
    .eq("emp_proprietaria_id", emp)
    .eq("slug", slug)
    .maybeSingle()
  if (!data) {
    return { estado: "inexistente", versao: "inexistente", nomeEntidade, logoUrl }
  }
  const conjunto = paraConjunto(data)

  if (registrarAcesso) {
    await admin
      .from("comunicacao_slides_conjuntos")
      .update({ ultimo_acesso: new Date().toISOString() })
      .eq("id", conjunto.id)
      .eq("emp_proprietaria_id", emp)
  }

  if (!conjunto.publicado) {
    return {
      estado: "despublicado",
      versao: hashDe(["despublicado", nomeEntidade, logoUrl]),
      nomeEntidade,
      logoUrl,
    }
  }

  const [{ data: linhas }, noticias] = await Promise.all([
    admin
      .from("comunicacao_slides")
      .select(COLUNAS_SLIDE)
      .eq("conjunto_id", conjunto.id)
      .eq("emp_proprietaria_id", emp)
      .order("ordem", { ascending: true })
      .order("created_at", { ascending: true }),
    conjunto.faixaAtiva && conjunto.faixaNoticias
      ? ultimasNoticias(conjunto.faixaQuantidade).catch(() => [])
      : Promise.resolve([]),
  ])

  const hoje = hojeSP()
  const slides = (linhas ?? [])
    .map(paraSlide)
    .filter((s) => situacaoDoSlide(s, hoje) === "no_ar" && slideTemConteudo(s))
  const faixa = conjunto.faixaAtiva
    ? itensDaFaixa(
        conjunto.faixaTexto,
        noticias.map((n) => n.titulo)
      )
    : []

  // Fora da versão: o que não aparece na tela (acesso, datas de criação…).
  const naTela = { ...conjunto, ultimoAcesso: null, createdAt: null }
  const versao = hashDe([naTela, slides, faixa, nomeEntidade, logoUrl])

  return { estado: "ok", versao, nomeEntidade, logoUrl, conjunto, slides, faixa }
}
