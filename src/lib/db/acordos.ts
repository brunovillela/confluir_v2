import "server-only"
import { texto } from "@/lib/db/comum"
import { randomUUID } from "node:crypto"

import { tenantAtual } from "@/lib/tenant"

import { listarFontesPagadoras } from "@/lib/db/fontes"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  SITUACOES_ACORDO,
  TIPOS_ACORDO,
  type CategoriaClausula,
  type SituacaoAcordo,
  type TipoAcordo,
} from "@/lib/acordos-constantes"

/**
 * Acordos Coletivos (ACT/CCT) — área de Representação Sindical. Registro dos
 * instrumentos coletivos com vigência, abrangência, fontes pagadoras
 * (empregadores do ACT), cláusulas estruturadas e alertas de vencimento.
 */

function escaparLike(t: string): string {
  return t.replace(/[%_\\]/g, "\\$&")
}
function nomeEmpresa(e: Record<string, unknown> | undefined): string | null {
  if (!e) return null
  return (
    [e.nome_fantasia, e.nome_razao].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    ) ?? null
  )
}

// ── Leitura ──────────────────────────────────────────────────────────────────

export type AcordoLinha = {
  id: string
  tipo: TipoAcordo
  titulo: string | null
  vigencia_inicio: string | null
  vigencia_fim: string | null
  situacao: SituacaoAcordo
  fontes: string[]
}

export type FiltrosAcordos = {
  tipo?: TipoAcordo | "todos"
  situacao?: SituacaoAcordo | "todas"
  busca?: string
}

async function fontesPorAcordo(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  empId: string,
  acordoIds: string[]
): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>()
  if (acordoIds.length === 0) return mapa
  const { data } = await admin
    .from("acordo_fontes")
    .select("acordo_id, empresa_id")
    .eq("emp_proprietaria_id", empId)
    .in("acordo_id", acordoIds)
  const empresaIds = [
    ...new Set((data ?? []).map((f) => texto(f.empresa_id)).filter(Boolean)),
  ] as string[]
  const nome = new Map<string, string>()
  if (empresaIds.length) {
    const { data: emps } = await admin
      .from("empresa")
      .select("id, nome_fantasia, nome_razao")
      .in("id", empresaIds)
    for (const e of emps ?? []) {
      const n = nomeEmpresa(e)
      if (n) nome.set(String(e.id), n)
    }
  }
  for (const f of data ?? []) {
    const aid = texto(f.acordo_id)
    const nomeF = texto(f.empresa_id) ? nome.get(String(f.empresa_id)) : null
    if (aid && nomeF) {
      const arr = mapa.get(aid) ?? []
      arr.push(nomeF)
      mapa.set(aid, arr)
    }
  }
  return mapa
}

export async function listarAcordos(
  filtros: FiltrosAcordos = {}
): Promise<AcordoLinha[]> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  let q = admin
    .from("acordo_coletivo")
    .select("id, tipo, titulo, vigencia_inicio, vigencia_fim, situacao")
    .eq("emp_proprietaria_id", empId)

  if (filtros.tipo && filtros.tipo !== "todos") q = q.eq("tipo", filtros.tipo)
  if (filtros.situacao && filtros.situacao !== "todas") {
    q = q.eq("situacao", filtros.situacao)
  }
  const termo = (filtros.busca ?? "").trim()
  if (termo) {
    const e = escaparLike(termo)
    q = q.or(`titulo.ilike.%${e}%,abrangencia.ilike.%${e}%`)
  }

  const { data, error } = await q
    .order("vigencia_fim", { ascending: false, nullsFirst: false })
    .limit(1000)
  if (error) throw new Error(`Falha ao listar acordos: ${error.message}`)

  const linhas = data ?? []
  const fontes = await fontesPorAcordo(
    admin,
    empId,
    linhas.map((a) => String(a.id))
  )
  return linhas.map((a) => ({
    id: String(a.id),
    tipo: (a.tipo ?? "act") as TipoAcordo,
    titulo: texto(a.titulo),
    vigencia_inicio: texto(a.vigencia_inicio),
    vigencia_fim: texto(a.vigencia_fim),
    situacao: (a.situacao ?? "em_negociacao") as SituacaoAcordo,
    fontes: fontes.get(String(a.id)) ?? [],
  }))
}

export type Clausula = {
  id: string
  numero: string | null
  titulo: string | null
  texto: string | null
  categoria: CategoriaClausula
}

export type AcordoDetalhe = {
  id: string
  tipo: TipoAcordo
  titulo: string | null
  numero_registro: string | null
  data_base: string | null
  vigencia_inicio: string | null
  vigencia_fim: string | null
  abrangencia: string | null
  situacao: SituacaoAcordo
  observacoes: string | null
  /** Acordo do sindicato com os PRÓPRIOS funcionários → aparece no Meu Perfil. */
  com_funcionarios_entidade: boolean
  documentoUrl: string | null
  fontes: string[]
  clausulas: Clausula[]
}

export async function obterAcordo(id: string): Promise<AcordoDetalhe | null> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data: a } = await admin
    .from("acordo_coletivo")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!a) return null

  const [fontesRes, clausRes] = await Promise.all([
    fontesPorAcordo(admin, empId, [id]),
    admin
      .from("acordo_clausulas")
      .select("id, numero, titulo, texto, categoria")
      .eq("acordo_id", id)
      .eq("emp_proprietaria_id", empId)
      .order("ordem", { ascending: true }),
  ])

  let documentoUrl: string | null = null
  const caminho = texto(a.documento_url)
  if (caminho) {
    const { data } = await admin.storage
      .from("acordos")
      .createSignedUrl(caminho, 3600)
    documentoUrl = data?.signedUrl ?? null
  }

  return {
    id: String(a.id),
    tipo: (a.tipo ?? "act") as TipoAcordo,
    titulo: texto(a.titulo),
    numero_registro: texto(a.numero_registro),
    data_base: texto(a.data_base),
    vigencia_inicio: texto(a.vigencia_inicio),
    vigencia_fim: texto(a.vigencia_fim),
    abrangencia: texto(a.abrangencia),
    situacao: (a.situacao ?? "em_negociacao") as SituacaoAcordo,
    observacoes: texto(a.observacoes),
    com_funcionarios_entidade: a.com_funcionarios_entidade === true,
    documentoUrl,
    fontes: fontesRes.get(id) ?? [],
    clausulas: (clausRes.data ?? []).map((c) => ({
      id: String(c.id),
      numero: texto(c.numero),
      titulo: texto(c.titulo),
      texto: texto(c.texto),
      categoria: (c.categoria ?? "outro") as CategoriaClausula,
    })),
  }
}

export type AcordoDoPerfil = {
  id: string
  tipo: TipoAcordo
  titulo: string | null
  vigencia_inicio: string | null
  vigencia_fim: string | null
  data_base: string | null
  documentoUrl: string | null
}

/**
 * Acordos da ENTIDADE com os próprios funcionários, para a área Meu Perfil
 * (autosserviço — sem exigir permissão de Representação). Regra do Bruno:
 * aparecem os marcados `com_funcionarios_entidade` com situação 'vigente',
 * MESMO com a vigência vencida (a página sinaliza); saem apenas quando
 * classificados como não vigentes (situação 'arquivado'). Retorna [] se a
 * coluna ainda não existe (rodar supabase/acordos-meu-perfil.sql).
 */
export async function acordosParaMeuPerfil(): Promise<AcordoDoPerfil[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("acordo_coletivo")
    .select("id, tipo, titulo, vigencia_inicio, vigencia_fim, data_base, documento_url")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("situacao", "vigente")
    .eq("com_funcionarios_entidade", true)
    .order("vigencia_fim", { ascending: false, nullsFirst: false })
  if (error) return []
  const linhas = data ?? []
  return Promise.all(
    linhas.map(async (a) => {
      let documentoUrl: string | null = null
      const caminho = texto(a.documento_url)
      if (caminho) {
        const { data: assinado } = await admin.storage
          .from("acordos")
          .createSignedUrl(caminho, 3600)
        documentoUrl = assinado?.signedUrl ?? null
      }
      return {
        id: String(a.id),
        tipo: (a.tipo ?? "act") as TipoAcordo,
        titulo: texto(a.titulo),
        vigencia_inicio: texto(a.vigencia_inicio),
        vigencia_fim: texto(a.vigencia_fim),
        data_base: texto(a.data_base),
        documentoUrl,
      }
    })
  )
}

/** Acordos vigentes com fim de vigência vencido ou nos próximos `dias` dias. */
export async function acordosVencendo(
  dias: number
): Promise<{ id: string; titulo: string | null; vigencia_fim: string | null }[]> {
  const admin = await createAdminClient()
  const limite = new Date()
  limite.setDate(limite.getDate() + dias)
  const { data } = await admin
    .from("acordo_coletivo")
    .select("id, titulo, vigencia_fim")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("situacao", "vigente")
    .not("vigencia_fim", "is", null)
    .lte("vigencia_fim", limite.toISOString().slice(0, 10))
    .order("vigencia_fim", { ascending: true })
  return (data ?? []).map((a) => ({
    id: String(a.id),
    titulo: texto(a.titulo),
    vigencia_fim: texto(a.vigencia_fim),
  }))
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export type OpcaoFonte = { id: string; nome: string }

export async function opcoesFontes(): Promise<OpcaoFonte[]> {
  const fontes = await listarFontesPagadoras()
  return fontes.map((f) => ({
    id: f.id,
    nome: f.nome_fantasia ?? f.nome_razao ?? "(sem nome)",
  }))
}

export async function fonteIdsDoAcordo(acordoId: string): Promise<string[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("acordo_fontes")
    .select("empresa_id")
    .eq("acordo_id", acordoId)
    .eq("emp_proprietaria_id", await tenantAtual())
  return (data ?? [])
    .map((f) => texto(f.empresa_id))
    .filter((v): v is string => Boolean(v))
}

export type DadosAcordo = {
  tipo: TipoAcordo
  titulo: string | null
  numero_registro: string | null
  data_base: string | null
  vigencia_inicio: string | null
  vigencia_fim: string | null
  abrangencia: string | null
  situacao: SituacaoAcordo
  observacoes: string | null
  /** Acordo com os funcionários da entidade → aparece no Meu Perfil. */
  com_funcionarios_entidade: boolean
  /** Caminho já gravável (upload na action); undefined = não mexer. */
  documento_url?: string | null
  fonteIds: string[]
}

function payload(d: DadosAcordo): Record<string, unknown> {
  const p: Record<string, unknown> = {
    tipo: TIPOS_ACORDO.some((t) => t.chave === d.tipo) ? d.tipo : "act",
    titulo: d.titulo,
    numero_registro: d.numero_registro,
    data_base: d.data_base,
    vigencia_inicio: d.vigencia_inicio,
    vigencia_fim: d.vigencia_fim,
    abrangencia: d.abrangencia,
    situacao: SITUACOES_ACORDO.some((s) => s.chave === d.situacao)
      ? d.situacao
      : "em_negociacao",
    observacoes: d.observacoes,
    com_funcionarios_entidade: d.com_funcionarios_entidade,
    updated_at: new Date().toISOString(),
  }
  if (d.documento_url !== undefined) p.documento_url = d.documento_url
  return p
}

async function gravarFontes(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  empId: string,
  acordoId: string,
  fonteIds: string[]
): Promise<void> {
  await admin
    .from("acordo_fontes")
    .delete()
    .eq("acordo_id", acordoId)
    .eq("emp_proprietaria_id", empId)
  const unicos = [...new Set(fonteIds.filter(Boolean))]
  if (unicos.length) {
    await admin.from("acordo_fontes").insert(
      unicos.map((empresa_id) => ({
        acordo_id: acordoId,
        empresa_id,
        emp_proprietaria_id: empId,
      }))
    )
  }
}

export async function criarAcordo(
  dados: DadosAcordo
): Promise<{ id?: string; erro?: string }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("acordo_coletivo")
    .insert({ ...payload(dados), emp_proprietaria_id: empId })
    .select("id")
    .single()
  if (error) return { erro: `Falha ao criar o acordo: ${error.message}` }
  await gravarFontes(admin, empId, String(data.id), dados.fonteIds)
  return { id: String(data.id) }
}

export async function atualizarAcordo(
  id: string,
  dados: DadosAcordo
): Promise<{ erro?: string }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { error } = await admin
    .from("acordo_coletivo")
    .update(payload(dados))
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Falha ao salvar o acordo: ${error.message}` }
  await gravarFontes(admin, empId, id, dados.fonteIds)
  return {}
}

export async function subirDocumentoAcordo(
  arquivo: File
): Promise<{ caminho?: string; erro?: string }> {
  if (arquivo.type !== "application/pdf") return { erro: "O acordo deve ser um PDF." }
  const admin = await createAdminClient()
  const caminho = `${randomUUID()}.pdf`
  const { error } = await admin.storage
    .from("acordos")
    .upload(caminho, arquivo, { contentType: "application/pdf", upsert: false })
  if (error) return { erro: `Falha ao subir o documento: ${error.message}` }
  return { caminho }
}

// ── Cláusulas ────────────────────────────────────────────────────────────────

export type DadosClausula = {
  numero: string | null
  titulo: string | null
  texto: string | null
  categoria: CategoriaClausula
}

export async function adicionarClausula(
  acordoId: string,
  dados: DadosClausula
): Promise<{ erro?: string }> {
  if (!dados.texto?.trim() && !dados.titulo?.trim()) {
    return { erro: "Informe ao menos o título ou o texto da cláusula." }
  }
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const { data: a } = await admin
    .from("acordo_coletivo")
    .select("id")
    .eq("id", acordoId)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!a) return { erro: "Acordo não encontrado." }
  const { count } = await admin
    .from("acordo_clausulas")
    .select("id", { count: "exact", head: true })
    .eq("acordo_id", acordoId)
    .eq("emp_proprietaria_id", empId)
  const { error } = await admin.from("acordo_clausulas").insert({
    acordo_id: acordoId,
    numero: dados.numero,
    titulo: dados.titulo,
    texto: dados.texto,
    categoria: dados.categoria,
    ordem: count ?? 0,
    emp_proprietaria_id: empId,
  })
  if (error) return { erro: `Falha ao adicionar a cláusula: ${error.message}` }
  return {}
}

export async function excluirClausula(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("acordo_clausulas")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao excluir a cláusula: ${error.message}` }
  return {}
}
