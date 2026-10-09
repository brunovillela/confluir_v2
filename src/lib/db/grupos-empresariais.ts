import "server-only"

import { cache } from "react"

import { esquemaAusente } from "@/lib/db/comum"
import { listarFontesPagadoras, type FontePagadora } from "@/lib/db/fontes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Grupos empresariais (09/10/2026) — supabase/grupos-empresariais.sql.
 *
 * O grupo reúne empresas de um conglomerado. As REPRESENTADAS são fontes
 * pagadoras (Empregadores) e trazem filiados; as demais entram só com nome e
 * CNPJ. Uma fonte pertence a no máximo um grupo. O grupo pode pagar as
 * contribuições de forma centralizada: uma relação só em Receitas.
 */

export const AVISO_SQL_GRUPOS =
  "Grupos empresariais precisam do SQL supabase/grupos-empresariais.sql — rode no Supabase."

export type MembroGrupo = {
  id: string
  /** Fonte pagadora (empregador representado); null = empresa sem representação. */
  empresaId: string | null
  nome: string
  cnpj: string | null
  representada: boolean
  filiadosAtivos: number
  inativa: boolean
}

export type GrupoLinha = {
  id: string
  nome: string
  descricao: string | null
  contribuicaoCentralizada: boolean
  empresaPagadoraId: string | null
  membros: MembroGrupo[]
  representadas: number
  filiadosAtivos: number
}

type LinhaGrupo = {
  id: string
  nome: string | null
  descricao: string | null
  contribuicao_centralizada: boolean | null
  empresa_pagadora_id: string | null
}
type LinhaMembro = {
  id: string
  grupo_id: string
  empresa_id: string | null
  nome: string | null
  cnpj: string | null
}

const nomeFonte = (f: FontePagadora) => f.nome_fantasia ?? f.nome_razao ?? "(sem nome)"

/** Todos os grupos do tenant, com os membros resolvidos. Uma leitura por request. */
export const listarGrupos = cache(async (): Promise<{ grupos: GrupoLinha[]; esquemaPronto: boolean }> => {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [{ data: grupos, error }, { data: membros, error: erroM }] = await Promise.all([
    admin
      .from("grupos_empresariais")
      .select("id, nome, descricao, contribuicao_centralizada, empresa_pagadora_id")
      .eq("emp_proprietaria_id", emp)
      .order("nome"),
    admin
      .from("grupo_empresarial_membros")
      .select("id, grupo_id, empresa_id, nome, cnpj")
      .eq("emp_proprietaria_id", emp),
  ])
  if (error || erroM) {
    if (esquemaAusente(error ?? erroM)) return { grupos: [], esquemaPronto: false }
    throw new Error(`Falha ao listar os grupos: ${(error ?? erroM)?.message}`)
  }
  const fontes = new Map((await listarFontesPagadoras()).map((f) => [f.id, f]))
  const porGrupo = new Map<string, MembroGrupo[]>()
  for (const m of (membros ?? []) as LinhaMembro[]) {
    const f = m.empresa_id ? fontes.get(m.empresa_id) : undefined
    const membro: MembroGrupo = {
      id: m.id,
      empresaId: m.empresa_id,
      nome: f ? nomeFonte(f) : (m.nome ?? "(sem nome)"),
      cnpj: f ? f.cnpj_cpf : m.cnpj,
      representada: Boolean(m.empresa_id),
      filiadosAtivos: f?.filiadosAtivos ?? 0,
      inativa: f?.inativa === true,
    }
    porGrupo.set(m.grupo_id, [...(porGrupo.get(m.grupo_id) ?? []), membro])
  }
  return {
    esquemaPronto: true,
    grupos: ((grupos ?? []) as LinhaGrupo[]).map((g) => {
      const ms = (porGrupo.get(g.id) ?? []).sort(
        (a, b) =>
          Number(b.representada) - Number(a.representada) ||
          b.filiadosAtivos - a.filiadosAtivos ||
          a.nome.localeCompare(b.nome, "pt-BR")
      )
      return {
        id: g.id,
        nome: g.nome ?? "(sem nome)",
        descricao: g.descricao,
        contribuicaoCentralizada: g.contribuicao_centralizada === true,
        empresaPagadoraId: g.empresa_pagadora_id,
        membros: ms,
        representadas: ms.filter((m) => m.representada).length,
        filiadosAtivos: ms.reduce((s, m) => s + m.filiadosAtivos, 0),
      }
    }),
  }
})

export async function obterGrupo(id: string): Promise<GrupoLinha | null> {
  return (await listarGrupos()).grupos.find((g) => g.id === id) ?? null
}

/** Grupo de cada fonte pagadora (para o selo, filtros e o recebimento). */
export async function gruposPorFonte(): Promise<Map<string, { id: string; nome: string }>> {
  const mapa = new Map<string, { id: string; nome: string }>()
  for (const g of (await listarGrupos()).grupos) {
    for (const m of g.membros) if (m.empresaId) mapa.set(m.empresaId, { id: g.id, nome: g.nome })
  }
  return mapa
}

/** Fontes representadas do grupo (ids). */
export async function fontesDoGrupo(grupoId: string): Promise<string[]> {
  const g = await obterGrupo(grupoId)
  return (g?.membros ?? []).flatMap((m) => (m.empresaId ? [m.empresaId] : []))
}

// ── Escrita ──────────────────────────────────────────────────────────────────

type DadosGrupo = {
  nome: string
  descricao: string | null
  contribuicaoCentralizada: boolean
  empresaPagadoraId: string | null
}

function erroDe(error: { code?: string; message: string } | null, padrao: string): string | null {
  if (!error) return null
  if (esquemaAusente(error)) return AVISO_SQL_GRUPOS
  if (error.code === "23505") return "Esta empresa já está em um grupo (uma empresa representada pertence a um grupo só)."
  return `${padrao}: ${error.message}`
}

export async function criarGrupo(dados: DadosGrupo): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("grupos_empresariais")
    .insert({
      nome: dados.nome,
      descricao: dados.descricao,
      contribuicao_centralizada: dados.contribuicaoCentralizada,
      empresa_pagadora_id: dados.empresaPagadoraId,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  const erro = erroDe(error, "Não foi possível criar o grupo")
  return erro ? { erro } : { id: String(data?.id) }
}

export async function atualizarGrupo(id: string, dados: DadosGrupo): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("grupos_empresariais")
    .update({
      nome: dados.nome,
      descricao: dados.descricao,
      contribuicao_centralizada: dados.contribuicaoCentralizada,
      empresa_pagadora_id: dados.empresaPagadoraId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  const erro = erroDe(error, "Não foi possível salvar o grupo")
  return erro ? { erro } : {}
}

export async function excluirGrupo(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("grupos_empresariais")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  const erro = erroDe(error, "Não foi possível excluir o grupo")
  return erro ? { erro } : {}
}

/** Empregador representado (fonte) entra no grupo. */
export async function adicionarEmpregador(grupoId: string, empresaId: string): Promise<{ erro?: string }> {
  const atual = (await gruposPorFonte()).get(empresaId)
  if (atual) {
    return {
      erro:
        atual.id === grupoId
          ? "Este empregador já está no grupo."
          : `Este empregador já está no grupo ${atual.nome} — uma empresa representada pertence a um grupo só.`,
    }
  }
  const admin = await createAdminClient()
  const { error } = await admin.from("grupo_empresarial_membros").insert({
    grupo_id: grupoId,
    empresa_id: empresaId,
    emp_proprietaria_id: await tenantAtual(),
  })
  const erro = erroDe(error, "Não foi possível incluir o empregador")
  return erro ? { erro } : {}
}

/** Empresa do grupo sem trabalhadores representados (só nome e CNPJ). */
export async function adicionarEmpresaExterna(
  grupoId: string,
  dados: { nome: string; cnpj: string | null }
): Promise<{ erro?: string }> {
  // Se o CNPJ já é de um empregador cadastrado, ele entra como representado.
  if (dados.cnpj) {
    const fonte = (await listarFontesPagadoras()).find(
      (f) => (f.cnpj_cpf ?? "").replace(/\D/g, "") === dados.cnpj
    )
    if (fonte) return adicionarEmpregador(grupoId, fonte.id)
  }
  const admin = await createAdminClient()
  const { error } = await admin.from("grupo_empresarial_membros").insert({
    grupo_id: grupoId,
    nome: dados.nome,
    cnpj: dados.cnpj,
    emp_proprietaria_id: await tenantAtual(),
  })
  const erro =
    error?.code === "23505"
      ? "Esta empresa já está no grupo."
      : erroDe(error, "Não foi possível incluir a empresa")
  return erro ? { erro } : {}
}

export async function removerMembro(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("grupo_empresarial_membros")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  const erro = erroDe(error, "Não foi possível remover a empresa")
  return erro ? { erro } : {}
}

// ── Contribuição centralizada (Receitas) ─────────────────────────────────────

export type GrupoRecebimento = {
  id: string
  nome: string
  fonteIds: string[]
  pagadoraId: string
}

/**
 * O grupo para gravar uma relação centralizada: precisa estar marcado como
 * pagador centralizado e ter empresas representadas. A pagadora recebe as
 * linhas que não casam (ou de quem não tem vínculo aberto no grupo).
 */
export async function grupoParaRecebimento(
  grupoId: string
): Promise<GrupoRecebimento | { erro: string }> {
  const g = await obterGrupo(grupoId)
  if (!g) return { erro: "Grupo empresarial não encontrado." }
  if (!g.contribuicaoCentralizada) {
    return { erro: "Este grupo não está marcado como pagador centralizado das contribuições." }
  }
  const fonteIds = g.membros.flatMap((m) => (m.empresaId ? [m.empresaId] : []))
  if (fonteIds.length === 0) return { erro: "O grupo não tem empresas representadas." }
  const pagadoraId =
    g.empresaPagadoraId && fonteIds.includes(g.empresaPagadoraId) ? g.empresaPagadoraId : fonteIds[0]
  return { id: g.id, nome: g.nome, fonteIds, pagadoraId }
}

/** Grupos com empresas representadas, para marcar o grupo inteiro num acordo. */
export async function gruposParaSelecao(): Promise<{ id: string; nome: string; fonteIds: string[] }[]> {
  return (await listarGrupos()).grupos
    .map((g) => ({
      id: g.id,
      nome: g.nome,
      fonteIds: g.membros.flatMap((m) => (m.empresaId ? [m.empresaId] : [])),
    }))
    .filter((g) => g.fonteIds.length > 0)
}
