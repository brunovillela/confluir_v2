import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { createAdminClient, createServiceClient } from "@/lib/supabase/admin"

/**
 * Organização (tenant) — o registro de `empresa` cujo id é o tenant atual.
 * Identidade que alimenta o cabeçalho/rodapé dos ofícios: razão social, CNPJ,
 * logo e as sedes (`empresa_sede`). O logo fica no bucket PÚBLICO `organizacao`
 * e seu caminho em `empresa.logomarca`.
 */

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null
}

const TIPOS_LOGO: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
}

/** URL pública do logo (bucket público) — direto, sem assinar. */
export function urlLogo(caminho: string | null): string | null {
  if (!caminho) return null
  if (/^(https?:)?\/\//.test(caminho)) {
    return caminho.startsWith("//") ? `https:${caminho}` : caminho
  }
  const admin = createServiceClient()
  const { data } = admin.storage.from("organizacao").getPublicUrl(caminho)
  return data.publicUrl
}

export type Organizacao = {
  id: string
  nomeRazao: string | null
  nomeFantasia: string | null
  cnpjCpf: string | null
  logomarca: string | null
  logoUrl: string | null
  /** Contato/site — configuráveis por organização (multitenant). */
  siteUrl: string | null
  emailContato: string | null
  noticiasUrl: string | null
  noticiasFeedUrl: string | null
}

/** Campos de contato ausentes até rodar supabase/organizacao-contato.sql. */
function esquemaAusente(erro: { code?: string } | null): boolean {
  return ["PGRST204", "42703"].includes(erro?.code ?? "")
}

export async function obterOrganizacao(): Promise<Organizacao | null> {
  const admin = await createAdminClient()
  const COLS_CONTATO =
    "id, nome_razao, nome_fantasia, cnpj_cpf, logomarca, site_url, email_contato, noticias_url, noticias_feed_url"

  const completa = await admin
    .from("empresa")
    .select(COLS_CONTATO)
    .eq("id", await tenantAtual())
    .maybeSingle()

  // Degrada para os campos básicos enquanto as colunas de contato não existem.
  let data: Record<string, unknown> | null = completa.data
  if (completa.error && esquemaAusente(completa.error)) {
    const basica = await admin
      .from("empresa")
      .select("id, nome_razao, nome_fantasia, cnpj_cpf, logomarca")
      .eq("id", await tenantAtual())
      .maybeSingle()
    data = basica.data
  }
  if (!data) return null

  const linha = data as Record<string, unknown>
  return {
    id: linha.id as string,
    nomeRazao: texto(linha.nome_razao),
    nomeFantasia: texto(linha.nome_fantasia),
    cnpjCpf: texto(linha.cnpj_cpf),
    logomarca: texto(linha.logomarca),
    logoUrl: urlLogo(texto(linha.logomarca)),
    siteUrl: texto(linha.site_url),
    emailContato: texto(linha.email_contato),
    noticiasUrl: texto(linha.noticias_url),
    noticiasFeedUrl: texto(linha.noticias_feed_url),
  }
}

export type DadosOrganizacao = {
  nome_razao: string
  nome_fantasia: string | null
  cnpj_cpf: string | null
  site_url: string | null
  email_contato: string | null
  noticias_url: string | null
  noticias_feed_url: string | null
}

export async function atualizarOrganizacao(
  dados: DadosOrganizacao
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("empresa")
    .update({ ...dados, updated_at: new Date().toISOString() })
    .eq("id", await tenantAtual())
  if (error) {
    if (esquemaAusente(error)) {
      return {
        erro: "Rode supabase/organizacao-contato.sql para habilitar os campos de site e contato.",
      }
    }
    return { erro: `Falha ao salvar organização: ${error.message}` }
  }
  return {}
}

/** Sobe o logo no bucket público e grava o caminho em `empresa.logomarca`. */
export async function subirLogo(
  arquivo: File
): Promise<{ erro?: string }> {
  const extensao = TIPOS_LOGO[arquivo.type]
  if (!extensao) return { erro: "O logo deve ser PNG, JPG, WEBP ou SVG." }
  if (arquivo.size > 3 * 1024 * 1024) {
    return { erro: "O logo deve ter no máximo 3 MB." }
  }
  const caminho = `logo-${Date.now()}.${extensao}`
  const admin = await createAdminClient()
  const { error } = await admin.storage
    .from("organizacao")
    .upload(caminho, arquivo, { contentType: arquivo.type, upsert: true })
  if (error) return { erro: `Falha ao subir o logo: ${error.message}` }

  const { error: erroDb } = await admin
    .from("empresa")
    .update({ logomarca: caminho, updated_at: new Date().toISOString() })
    .eq("id", await tenantAtual())
  if (erroDb) return { erro: `Logo subiu, mas falhou ao salvar: ${erroDb.message}` }
  return {}
}

// ── Sedes ───────────────────────────────────────────────────────────────────

export type Sede = {
  id: string
  nome: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  telefones: string | null
}

const COLS_SEDE =
  "id, nome, cep, logradouro, numero, complemento, bairro, cidade, estado, telefones"

function mapaSede(d: Record<string, unknown>): Sede {
  return {
    id: d.id as string,
    nome: texto(d.nome),
    cep: texto(d.cep),
    logradouro: texto(d.logradouro),
    numero: texto(d.numero),
    complemento: texto(d.complemento),
    bairro: texto(d.bairro),
    cidade: texto(d.cidade),
    estado: texto(d.estado),
    telefones: texto(d.telefones),
  }
}

export async function listarSedes(): Promise<{ disponivel: boolean; sedes: Sede[] }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("empresa_sede")
    .select(COLS_SEDE)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("nome", { ascending: true })
  if (error) {
    // coluna `telefones` ausente antes do SQL
    if (["PGRST204", "42703"].includes(error.code ?? "")) {
      return { disponivel: false, sedes: [] }
    }
    throw new Error(`Falha ao listar sedes: ${error.message}`)
  }
  return { disponivel: true, sedes: (data ?? []).map(mapaSede) }
}

/**
 * Nomes das sedes do tenant (para dropdowns de lotação/retirada). Fonte
 * multitenant: `empresa_sede` — nada de lista fixa por organização.
 */
export async function nomesDasSedes(): Promise<string[]> {
  const { sedes } = await listarSedes()
  return sedes
    .map((s) => s.nome)
    .filter((n): n is string => typeof n === "string" && n.trim() !== "")
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
}

export type DadosSede = {
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
  telefones: string | null
}

export async function atualizarSede(
  id: string,
  dados: DadosSede
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("empresa_sede")
    .update(dados)
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao salvar sede: ${error.message}` }
  return {}
}
