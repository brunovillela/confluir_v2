import "server-only"
import { texto } from "@/lib/db/comum"
import { randomUUID } from "node:crypto"

import { tenantAtual } from "@/lib/tenant"

import {
  listarMandatos,
  urlDocumentoDiretoria,
} from "@/lib/db/diretoria"
import { createAdminClient } from "@/lib/supabase/admin"
import { TIPOS_REUNIAO, TITULO_SOB_SIGILO, type TipoReuniao } from "@/lib/atas-constantes"
import { ehSigiloDeliberacao, type SigiloDeliberacao } from "@/lib/deliberacoes-constantes"

/**
 * Atas de reunião (`reuniao_ata`) — ancoradas no mandato. PDF no bucket
 * `diretoria` (subpasta `atas/`), reusando `urlDocumentoDiretoria` p/ ler.
 */

function escaparLike(t: string): string {
  return t.replace(/[%_\\]/g, "\\$&")
}
function tipoValido(t: string): TipoReuniao {
  return TIPOS_REUNIAO.some((x) => x.chave === t) ? (t as TipoReuniao) : "outra"
}

/** Sigilo gravado na ata; inválido ou ausente = restrito. */
function sigiloDe(v: unknown): SigiloDeliberacao {
  return ehSigiloDeliberacao(v) ? v : "restrito"
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
  /** TITULO_SOB_SIGILO quando o sigilo da ata está acima do nível de quem lista. */
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

/**
 * `sigilos`: os graus que o nível de quem lista alcança. O título de uma ata
 * acima dele não aparece nem serve à busca (a busca acharia a ata pelo
 * assunto escondido).
 */
export async function listarAtas(filtros: FiltrosAtas, sigilos: SigiloDeliberacao[]): Promise<AtaLinha[]> {
  const data = await buscarAtas(filtros, sigilos, "id, tipo, titulo, data, mandato_id, sigilo_documento")
  const nomes = await nomesDeMandatos()
  return data.map((a) => ({
    id: String(a.id),
    tipo: tipoValido(String(a.tipo ?? "outra")),
    titulo: sigilos.includes(sigiloDe(a.sigilo_documento)) ? texto(a.titulo) : TITULO_SOB_SIGILO,
    data: texto(a.data),
    mandatoId: texto(a.mandato_id),
    mandatoNome: a.mandato_id ? (nomes.get(String(a.mandato_id)) ?? null) : null,
  }))
}

/** Linha da planilha de atas: os textos acima do nível vêm como TEXTO_SOB_SIGILO. */
export type AtaPlanilha = AtaLinha & {
  orgao: string | null
  hora: string | null
  local: string | null
  sigilo: SigiloDeliberacao
  pauta: string | null
  resumo: string | null
  presentes: string | null
  observacoes: string | null
  temPdf: boolean
}

/** Marca no lugar de um texto acima do nível de quem exporta. */
export const TEXTO_SOB_SIGILO = "(sob sigilo)"

/**
 * As atas do filtro com todos os campos, para a planilha — título, pauta,
 * resumo, presentes e observações só dentro do nível (`sigilos`), como na
 * página da ata. O PDF não vai: a planilha só diz se há.
 */
export async function listarAtasParaPlanilha(filtros: FiltrosAtas, sigilos: SigiloDeliberacao[]): Promise<AtaPlanilha[]> {
  const data = await buscarAtas(
    filtros,
    sigilos,
    "id, tipo, orgao, titulo, data, hora, local, mandato_id, sigilo_documento, pauta, resumo, presentes, observacoes, documento_url"
  )
  const nomes = await nomesDeMandatos()
  return data.map((a) => {
    const sigilo = sigiloDe(a.sigilo_documento)
    const alcanca = sigilos.includes(sigilo)
    const sob = (v: unknown) => {
      const t = texto(v)
      return t && !alcanca ? TEXTO_SOB_SIGILO : t
    }
    return {
      id: String(a.id),
      tipo: tipoValido(String(a.tipo ?? "outra")),
      titulo: alcanca ? texto(a.titulo) : TITULO_SOB_SIGILO,
      data: texto(a.data),
      mandatoId: texto(a.mandato_id),
      mandatoNome: a.mandato_id ? (nomes.get(String(a.mandato_id)) ?? null) : null,
      orgao: texto(a.orgao),
      hora: texto(a.hora),
      local: texto(a.local),
      sigilo,
      pauta: sob(a.pauta),
      resumo: sob(a.resumo),
      presentes: sob(a.presentes),
      observacoes: sob(a.observacoes),
      temPdf: Boolean(texto(a.documento_url)),
    }
  })
}

/** A consulta das listas de atas, com filtros e a busca restrita ao nível. */
async function buscarAtas(
  filtros: FiltrosAtas,
  sigilos: SigiloDeliberacao[],
  campos: string
): Promise<Record<string, unknown>[]> {
  const admin = await createAdminClient()
  let q = admin
    .from("reuniao_ata")
    .select(campos)
    .eq("emp_proprietaria_id", await tenantAtual())

  if (filtros.tipo && filtros.tipo !== "todos") q = q.eq("tipo", filtros.tipo)
  if (filtros.mandatoId) q = q.eq("mandato_id", filtros.mandatoId)
  const termo = (filtros.busca ?? "").trim()
  if (termo) {
    const e = escaparLike(termo)
    q =
      sigilos.length > 0
        ? q.or(`and(sigilo_documento.in.(${sigilos.join(",")}),titulo.ilike.%${e}%),orgao.ilike.%${e}%`)
        : q.ilike("orgao", `%${e}%`)
  }

  const { data, error } = await q
    .order("data", { ascending: false, nullsFirst: false })
    .limit(1000)
  if (error) throw new Error(`Falha ao listar atas: ${error.message}`)
  return (data ?? []) as unknown as Record<string, unknown>[]
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
  /**
   * Título, pauta, resumo (breve; as decisões são itens, db/deliberacoes),
   * presentes e observações seguem o sigilo do PDF: null quando acima do
   * nível do usuário — `ocultos` diz quais existem e foram escondidos.
   */
  pauta: string | null
  resumo: string | null
  presentes: string | null
  observacoes: string | null
  ocultos: { titulo: boolean; pauta: boolean; resumo: boolean; presentes: boolean; observacoes: boolean }
  /** Link assinado do PDF — só quando o nível de sigilo do usuário alcança `sigiloDocumento`. */
  documentoUrl: string | null
  /** Há PDF, mesmo que o usuário não possa abri-lo. */
  temDocumento: boolean
  sigiloDocumento: SigiloDeliberacao
}

/**
 * A ata, com o link do PDF só se `sigilos` (os graus que o nível do usuário
 * alcança) incluir o sigilo do documento. O bucket é privado: sem o link
 * assinado, o PDF não se abre.
 */
export async function obterAta(id: string, sigilos: SigiloDeliberacao[]): Promise<AtaDetalhe | null> {
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
  const sigiloDocumento = sigiloDe(a.sigilo_documento)
  const caminho = texto(a.documento_url)
  // Título, PDF, pauta, resumo, presentes e observações: só dentro do nível de sigilo do usuário.
  const alcanca = sigilos.includes(sigiloDocumento)
  const documentoUrl = caminho && alcanca ? await urlDocumentoDiretoria(caminho) : null
  const pauta = texto(a.pauta)
  const resumo = texto(a.resumo)
  const observacoes = texto(a.observacoes)
  const titulo = texto(a.titulo)
  const presentes = texto(a.presentes)

  return {
    id: String(a.id),
    mandatoId: texto(a.mandato_id),
    mandatoNome,
    tipo: tipoValido(String(a.tipo ?? "outra")),
    orgao: texto(a.orgao),
    titulo: alcanca ? titulo : null,
    data: texto(a.data),
    hora: texto(a.hora),
    local: texto(a.local),
    pauta: alcanca ? pauta : null,
    resumo: alcanca ? resumo : null,
    presentes: alcanca ? presentes : null,
    observacoes: alcanca ? observacoes : null,
    ocultos: {
      titulo: Boolean(titulo) && !alcanca,
      presentes: Boolean(presentes) && !alcanca,
      pauta: Boolean(pauta) && !alcanca,
      resumo: Boolean(resumo) && !alcanca,
      observacoes: Boolean(observacoes) && !alcanca,
    },
    documentoUrl,
    temDocumento: Boolean(caminho),
    sigiloDocumento,
  }
}

/** Mandatos p/ o seletor (id + rótulo). */
export async function opcoesMandatos(): Promise<
  { id: string; nome: string }[]
> {
  const mandatos = await listarMandatos()
  return mandatos
    .map((m) => ({
      id: m.id,
      nome: m.mandato ?? "(mandato sem nome)",
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export type DadosAta = {
  mandato_id: string | null
  tipo: TipoReuniao
  orgao: string | null
  /** Título, pauta, resumo, presentes e observações: undefined = não mexer (acima do nível de quem edita). */
  titulo?: string | null
  data: string | null
  hora: string | null
  local: string | null
  pauta?: string | null
  resumo?: string | null
  presentes?: string | null
  observacoes?: string | null
  /** Caminho já gravável (upload na action); undefined = não mexer. */
  documento_url?: string | null
  /** Sigilo do PDF; undefined = não mexer. */
  sigilo_documento?: SigiloDeliberacao
}

function payload(d: DadosAta): Record<string, unknown> {
  const p: Record<string, unknown> = {
    mandato_id: d.mandato_id,
    tipo: tipoValido(d.tipo),
    orgao: d.orgao,
    data: d.data,
    hora: d.hora,
    local: d.local,
    updated_at: new Date().toISOString(),
  }
  if (d.titulo !== undefined) p.titulo = d.titulo
  if (d.presentes !== undefined) p.presentes = d.presentes
  if (d.pauta !== undefined) p.pauta = d.pauta
  if (d.resumo !== undefined) p.resumo = d.resumo
  if (d.observacoes !== undefined) p.observacoes = d.observacoes
  if (d.documento_url !== undefined) p.documento_url = d.documento_url
  if (d.sigilo_documento !== undefined) p.sigilo_documento = d.sigilo_documento
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

/** Sigilo atual do PDF da ata (null = ata não encontrada). */
export async function sigiloDocumentoDaAta(id: string): Promise<SigiloDeliberacao | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("reuniao_ata")
    .select("sigilo_documento")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!data) return null
  return sigiloDe(data.sigilo_documento)
}
