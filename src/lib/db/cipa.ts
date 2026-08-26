import "server-only"
import { esquemaAusente } from "@/lib/db/comum"
import { tenantAtual } from "@/lib/tenant"

import {
  type RepresentanteCipa,
  type ReuniaoCipa,
} from "@/lib/cipa-constantes"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Saúde — CIPA das empresas.
 *
 * A CIPA é DA EMPRESA; o sindicato é convidado e se faz representar. O que
 * se registra é o CONVITE — recusa e ausência entram, senão a frequência de
 * convites por empresa fica sem denominador.
 *
 * Ver supabase/saude-cipa.sql.
 */

const AVISO_SQL =
  "CIPA ainda não configurada — rode supabase/saude-cipa.sql no SQL Editor do Supabase."

// Constantes e tipos vivem em lib/cipa-constantes.ts (client-safe) — este
// arquivo tem server-only e não pode ser importado por componente client.
export {
  SITUACOES_CIPA,
  type RepresentanteCipa,
  type ReuniaoCipa,
  type SituacaoCipa,
} from "@/lib/cipa-constantes"

const CAMPOS =
  "id,data_reuniao,empresa_id,unidade,ordinaria,online,demanda_embarque," +
  "convite_recebido_em,situacao,motivo_ausencia,motivo_especifico,assuntos," +
  "observacoes,ata_arquivo"

export async function listarReunioesCipa(filtros: {
  empresaId?: string
  situacao?: string
  de?: string
  ate?: string
}): Promise<{ linhas: ReuniaoCipa[]; disponivel: boolean }> {
  const admin = await createAdminClient()

  let q = admin
    .from("saude_cipa_agenda")
    .select(CAMPOS)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (filtros.empresaId) q = q.eq("empresa_id", filtros.empresaId)
  if (filtros.situacao) q = q.eq("situacao", filtros.situacao)
  if (filtros.de) q = q.gte("data_reuniao", filtros.de)
  if (filtros.ate) q = q.lte("data_reuniao", filtros.ate)

  const { data, error } = await q
    .order("data_reuniao", { ascending: false, nullsFirst: false })
    .limit(500)

  if (error) {
    if (esquemaAusente(error)) return { linhas: [], disponivel: false }
    throw error
  }

  type Bruto = Omit<ReuniaoCipa, "empresaNome" | "representantes">
  const brutos = (data ?? []) as unknown as Bruto[]
  if (brutos.length === 0) return { linhas: [], disponivel: true }

  const [empresas, representantes] = await Promise.all([
    mapaEmpresas(brutos.map((r) => r.empresa_id)),
    representantesDasReunioes(brutos.map((r) => r.id)),
  ])

  return {
    linhas: brutos.map((r) => ({
      ...r,
      empresaNome: r.empresa_id ? (empresas.get(r.empresa_id) ?? null) : null,
      representantes: representantes.get(r.id) ?? [],
    })),
    disponivel: true,
  }
}

export async function buscarReuniaoCipa(
  id: string
): Promise<ReuniaoCipa | null> {
  const { linhas } = await listarReunioesCipa({})
  return linhas.find((r) => r.id === id) ?? null
}

async function mapaEmpresas(
  ids: (string | null)[]
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const limpos = [...new Set(ids.filter((v): v is string => Boolean(v)))]
  if (limpos.length === 0) return mapa
  const admin = await createAdminClient()
  for (let i = 0; i < limpos.length; i += 200) {
    const { data } = await admin
      .from("empresa")
      .select("id,nome_fantasia,nome_razao")
      .in("id", limpos.slice(i, i + 200))
    for (const e of (data ?? []) as {
      id: string
      nome_fantasia: string | null
      nome_razao: string | null
    }[]) {
      mapa.set(e.id, e.nome_fantasia ?? e.nome_razao ?? "(sem nome)")
    }
  }
  return mapa
}

async function representantesDasReunioes(
  reuniaoIds: string[]
): Promise<Map<string, RepresentanteCipa[]>> {
  const mapa = new Map<string, RepresentanteCipa[]>()
  if (reuniaoIds.length === 0) return mapa

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("saude_cipa_representantes")
    .select("id,reuniao_id,usuario_id,filiado_id,nome,compareceu")
    .in("reuniao_id", reuniaoIds)
  if (error) return mapa

  const brutos = (data ?? []) as unknown as (Omit<
    RepresentanteCipa,
    "nomeExibicao"
  > & { reuniao_id: string })[]

  // Resolve os nomes: usuário tem prioridade, depois filiado, depois o
  // texto digitado (que existe justamente para quem não está em nenhum).
  const usuarioIds = [...new Set(brutos.map((r) => r.usuario_id).filter(Boolean))]
  const filiadoIds = [...new Set(brutos.map((r) => r.filiado_id).filter(Boolean))]
  const nomesUsuario = new Map<string, string>()
  const nomesFiliado = new Map<string, string>()

  if (usuarioIds.length > 0) {
    const { data: us } = await admin
      .from("usuarios")
      .select("id,nome_completo")
      .in("id", usuarioIds as string[])
    for (const u of (us ?? []) as { id: string; nome_completo: string | null }[]) {
      if (u.nome_completo) nomesUsuario.set(u.id, u.nome_completo)
    }
  }
  if (filiadoIds.length > 0) {
    const { data: fs } = await admin
      .from("filiacoes")
      .select("id,nome_completo")
      .in("id", filiadoIds as string[])
    for (const f of (fs ?? []) as { id: string; nome_completo: string | null }[]) {
      if (f.nome_completo) nomesFiliado.set(f.id, f.nome_completo)
    }
  }

  for (const r of brutos) {
    const nomeExibicao =
      (r.usuario_id ? nomesUsuario.get(r.usuario_id) : null) ??
      (r.filiado_id ? nomesFiliado.get(r.filiado_id) : null) ??
      r.nome ??
      "(sem nome)"
    const lista = mapa.get(r.reuniao_id) ?? []
    lista.push({
      id: r.id,
      usuario_id: r.usuario_id,
      filiado_id: r.filiado_id,
      nome: r.nome,
      compareceu: r.compareceu === true,
      nomeExibicao,
    })
    mapa.set(r.reuniao_id, lista)
  }
  return mapa
}

export type DadosReuniao = {
  empresa_id: string | null
  data_reuniao: string
  unidade: string | null
  ordinaria: boolean
  online: boolean
  demanda_embarque: boolean
  convite_recebido_em: string | null
  situacao: string
  motivo_ausencia: string | null
  motivo_especifico: string | null
  assuntos: string | null
  observacoes: string | null
}

export async function salvarReuniaoCipa(
  dados: DadosReuniao,
  id?: string
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  if (!dados.data_reuniao) return { erro: "Informe a data da reunião." }

  const registro = {
    ...dados,
    motivo_ausencia: dados.motivo_ausencia?.trim() || null,
    motivo_especifico: dados.motivo_especifico?.trim() || null,
    assuntos: dados.assuntos?.trim() || null,
    observacoes: dados.observacoes?.trim() || null,
    unidade: dados.unidade?.trim() || null,
    updated_at: new Date().toISOString(),
  }

  if (id) {
    const { error } = await admin
      .from("saude_cipa_agenda")
      .update(registro)
      .eq("id", id)
    if (error) return { erro: esquemaAusente(error) ? AVISO_SQL : error.message }
    return { id }
  }

  const { data, error } = await admin
    .from("saude_cipa_agenda")
    .insert({ ...registro, emp_proprietaria_id: await tenantAtual() })
    .select("id")
    .single()
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL : error.message }
  return { id: (data as { id: string }).id }
}

export async function excluirReuniaoCipa(
  id: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("saude_cipa_agenda").delete().eq("id", id)
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL : error.message }
  return {}
}

// ---------------------------------------------------------------------------
// Representantes
// ---------------------------------------------------------------------------

export async function adicionarRepresentante(
  reuniaoId: string,
  dados: { usuario_id?: string | null; filiado_id?: string | null; nome?: string | null }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const nome = dados.nome?.trim() || null
  if (!dados.usuario_id && !dados.filiado_id && !nome) {
    return { erro: "Escolha a pessoa ou informe o nome." }
  }

  const { error } = await admin.from("saude_cipa_representantes").insert({
    reuniao_id: reuniaoId,
    usuario_id: dados.usuario_id || null,
    filiado_id: dados.filiado_id || null,
    nome,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL : error.message }
  return {}
}

/**
 * Marca presença do representante e mantém a situação da reunião coerente.
 *
 * Se alguém compareceu, a reunião passa a 'compareceu' — evita o estado
 * contraditório de reunião "não compareceu" com representante presente.
 */
export async function definirComparecimento(
  representanteId: string,
  compareceu: boolean
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()

  const { data, error } = await admin
    .from("saude_cipa_representantes")
    .update({ compareceu })
    .eq("id", representanteId)
    .select("reuniao_id")
    .single()
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL : error.message }

  if (compareceu) {
    await admin
      .from("saude_cipa_agenda")
      .update({ situacao: "compareceu", updated_at: new Date().toISOString() })
      .eq("id", (data as { reuniao_id: string }).reuniao_id)
  }
  return {}
}

export async function removerRepresentante(
  id: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("saude_cipa_representantes")
    .delete()
    .eq("id", id)
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL : error.message }
  return {}
}

// ---------------------------------------------------------------------------
// Ata (PDF no bucket privado)
// ---------------------------------------------------------------------------

export async function gravarAta(
  reuniaoId: string,
  arquivo: File
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const caminho = `cipa/${reuniaoId}/${Date.now()}-${arquivo.name.replace(/[^\w.-]/g, "_")}`

  const { error: erroUpload } = await admin.storage
    .from("saude")
    .upload(caminho, arquivo, { contentType: arquivo.type, upsert: false })
  if (erroUpload) return { erro: `Falha no upload: ${erroUpload.message}` }

  const { error } = await admin
    .from("saude_cipa_agenda")
    .update({ ata_arquivo: caminho, updated_at: new Date().toISOString() })
    .eq("id", reuniaoId)
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL : error.message }
  return {}
}

/** URL assinada (1h) do PDF da ata. Legado com URL absoluta passa direto. */
export async function urlAta(caminho: string | null): Promise<string | null> {
  if (!caminho) return null
  if (/^(https?:)?\/\//.test(caminho)) {
    return caminho.startsWith("//") ? `https:${caminho}` : caminho
  }
  const admin = await createAdminClient()
  const { data } = await admin.storage
    .from("saude")
    .createSignedUrl(caminho, 3600)
  return data?.signedUrl ?? null
}

// ---------------------------------------------------------------------------
// Indicadores
// ---------------------------------------------------------------------------

export type ResumoCipa = {
  disponivel: boolean
  total: number
  compareceu: number
  naoCompareceu: number
  recusado: number
  aguardando: number
  /** Frequência por empresa: convites recebidos × comparecimentos. */
  porEmpresa: {
    empresaId: string
    nome: string
    convites: number
    compareceu: number
  }[]
}

export async function resumoCipa(): Promise<ResumoCipa> {
  const { linhas, disponivel } = await listarReunioesCipa({})
  if (!disponivel) {
    return {
      disponivel: false,
      total: 0,
      compareceu: 0,
      naoCompareceu: 0,
      recusado: 0,
      aguardando: 0,
      porEmpresa: [],
    }
  }

  const conta = (s: string) => linhas.filter((r) => r.situacao === s).length
  const porEmpresa = new Map<
    string,
    { nome: string; convites: number; compareceu: number }
  >()
  for (const r of linhas) {
    if (!r.empresa_id) continue
    const atual = porEmpresa.get(r.empresa_id) ?? {
      nome: r.empresaNome ?? "(sem nome)",
      convites: 0,
      compareceu: 0,
    }
    atual.convites++
    if (r.situacao === "compareceu") atual.compareceu++
    porEmpresa.set(r.empresa_id, atual)
  }

  return {
    disponivel: true,
    total: linhas.length,
    compareceu: conta("compareceu"),
    naoCompareceu: conta("nao_compareceu"),
    recusado: conta("recusado"),
    aguardando: conta("convidado"),
    porEmpresa: [...porEmpresa.entries()]
      .map(([empresaId, v]) => ({ empresaId, ...v }))
      .sort((a, b) => b.convites - a.convites),
  }
}
