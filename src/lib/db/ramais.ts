import "server-only"

import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Ramais e telefones diretos da entidade (29/10/2026 — migração
 * institucional_ramais). Cadastro no Institucional, ao lado das linhas
 * celulares; o Meu perfil mostra os da pessoa em "Contatos corporativos".
 */

export type Ramal = {
  id: string
  ramal: string | null
  telefoneDireto: string | null
  local: string | null
  usuarioId: string | null
  responsavelNome: string | null
  observacao: string | null
}

export type DadosRamal = {
  ramal: string | null
  telefoneDireto: string | null
  local: string | null
  usuarioId: string | null
  observacao: string | null
}

const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "")

function paraRamal(r: Record<string, unknown>, nomes: Map<string, string>): Ramal {
  const usuarioId = texto(r.usuario_id)
  return {
    id: String(r.id),
    ramal: texto(r.ramal),
    telefoneDireto: texto(r.telefone_direto),
    local: texto(r.local),
    usuarioId,
    responsavelNome: usuarioId ? (nomes.get(usuarioId) ?? null) : null,
    observacao: texto(r.observacao),
  }
}

/** Todos os ramais do tenant (disponivel=false: migração não aplicada). */
export async function listarRamais(): Promise<{ disponivel: boolean; ramais: Ramal[] }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("institucional_ramais")
    .select("*")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("ramal", { ascending: true, nullsFirst: false })
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, ramais: [] }
    throw new Error(`Falha ao listar os ramais: ${error.message}`)
  }
  const linhas = (data ?? []) as Record<string, unknown>[]
  const ids = [...new Set(linhas.map((l) => texto(l.usuario_id)).filter((v): v is string => Boolean(v)))]
  const nomes = ids.length ? await nomesDosUsuarios(ids) : new Map<string, string>()
  return { disponivel: true, ramais: linhas.map((l) => paraRamal(l, nomes)) }
}

/** Os ramais/telefones diretos de uma pessoa (Meu perfil). */
export async function ramaisDoUsuario(usuarioId: string): Promise<Ramal[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("institucional_ramais")
    .select("*")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("usuario_id", usuarioId)
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((l) => paraRamal(l, new Map()))
}

async function preparar(dados: DadosRamal, ignorarId?: string): Promise<{ erro: string } | { registro: Record<string, string | null> }> {
  const ramal = digitos(dados.ramal) || null
  const direto = digitos(dados.telefoneDireto) || null
  if (!ramal && !direto) return { erro: "Informe o ramal, o telefone direto ou os dois." }
  if (ramal && (ramal.length < 2 || ramal.length > 6)) return { erro: "O ramal tem de 2 a 6 dígitos." }
  if (direto && (direto.length < 10 || direto.length > 11)) return { erro: "Informe o telefone direto com DDD (10 ou 11 dígitos)." }
  if (ramal) {
    const admin = await createAdminClient()
    let q = admin.from("institucional_ramais").select("id").eq("emp_proprietaria_id", await tenantAtual()).eq("ramal", ramal)
    if (ignorarId) q = q.neq("id", ignorarId)
    const { data } = await q.limit(1)
    if ((data ?? []).length) return { erro: "Esse ramal já está cadastrado." }
  }
  return {
    registro: {
      ramal,
      telefone_direto: direto,
      local: dados.local?.trim() || null,
      usuario_id: dados.usuarioId,
      observacao: dados.observacao?.trim() || null,
    },
  }
}

export async function criarRamal(dados: DadosRamal): Promise<{ erro?: string }> {
  const r = await preparar(dados)
  if ("erro" in r) return r
  const admin = await createAdminClient()
  const { error } = await admin.from("institucional_ramais").insert({ ...r.registro, emp_proprietaria_id: await tenantAtual() })
  if (error) return { erro: `Falha ao cadastrar o ramal: ${error.message}` }
  return {}
}

export async function atualizarRamal(id: string, dados: DadosRamal): Promise<{ erro?: string }> {
  const r = await preparar(dados, id)
  if ("erro" in r) return r
  const admin = await createAdminClient()
  const { error } = await admin
    .from("institucional_ramais")
    .update({ ...r.registro, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao salvar o ramal: ${error.message}` }
  return {}
}

export async function excluirRamal(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("institucional_ramais").delete().eq("id", id).eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao excluir o ramal: ${error.message}` }
  return {}
}
