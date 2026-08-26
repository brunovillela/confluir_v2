import "server-only"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { tenantAtual } from "@/lib/tenant"

import { CHAVES_PERMISSAO } from "@/lib/permissoes-catalogo"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Perfis de acesso (RBAC) — leituras e escrita para a tela de Usuários. A
 * RESOLUÇÃO das permissões efetivas fica em @/lib/permissoes-resolver
 * (resolverPermissoes), fora de `server-only`/node, porque o proxy (middleware)
 * também a consome. Schema e decisões em supabase/perfis-acesso.sql.
 */

const CHAVES_VALIDAS = new Set(CHAVES_PERMISSAO)
const AVISO_SCHEMA = "Rode supabase/perfis-acesso.sql antes de usar os perfis."

export type ResultadoAcao = { ok: true; id?: string } | { erro: string }

export type PerfilLinha = {
  id: string
  nome: string
  descricao: string | null
  alcada_aprovacao: number | null
  concede_tudo: boolean
  sistema: boolean
  ativo: boolean
  ordem: number
  padrao_onboarding: boolean
}

const SELECT_PERFIL =
  "id, nome, descricao, alcada_aprovacao, concede_tudo, sistema, ativo, ordem, padrao_onboarding"

export type PerfilComChaves = PerfilLinha & { chaves: string[] }

// ── Leituras ─────────────────────────────────────────────────────────────────

export async function listarPerfis(): Promise<PerfilLinha[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("perfis")
    .select(SELECT_PERFIL)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao listar perfis: ${error.message}`)
  }
  return (data ?? []) as PerfilLinha[]
}

export async function perfilComChaves(
  id: string
): Promise<PerfilComChaves | null> {
  const admin = await createAdminClient()
  const { data: p } = await admin
    .from("perfis")
    .select(SELECT_PERFIL)
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!p) return null

  const { data: chaves } = await admin
    .from("perfil_permissoes")
    .select("chave")
    .eq("perfil_id", id)
  return {
    ...(p as PerfilLinha),
    chaves: (chaves ?? []).map((c) => String(c.chave)),
  }
}

/** IDs dos perfis atribuídos a um usuário (para marcar o seletor). */
export async function perfisDoUsuario(usuarioId: string): Promise<string[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("usuario_perfis")
    .select("perfil_id")
    .eq("usuario_id", usuarioId)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler perfis do usuário: ${error.message}`)
  }
  return (data ?? []).map((r) => String(r.perfil_id))
}

// ── Escrita: atribuição de perfis a um usuário ───────────────────────────────

/** Substitui o conjunto de perfis do usuário pelos IDs informados. */
export async function atribuirPerfis(
  usuarioId: string,
  perfilIds: string[]
): Promise<ResultadoAcao> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  // Só aceita perfis do próprio tenant (evita id de outro tenant via form).
  const { data: doTenant, error: eLista } = await admin
    .from("perfis")
    .select("id")
    .eq("emp_proprietaria_id", emp)
  if (eLista) {
    if (esquemaAusente(eLista)) return { erro: AVISO_SCHEMA }
    return { erro: `Falha ao validar perfis: ${eLista.message}` }
  }
  const validos = new Set((doTenant ?? []).map((p) => String(p.id)))
  const desejados = [...new Set(perfilIds.filter((id) => validos.has(id)))]

  const { data: atuais } = await admin
    .from("usuario_perfis")
    .select("id, perfil_id")
    .eq("usuario_id", usuarioId)
    .eq("emp_proprietaria_id", emp)
  const atuaisPorPerfil = new Map(
    (atuais ?? []).map((r) => [String(r.perfil_id), String(r.id)])
  )

  const remover = [...atuaisPorPerfil.entries()]
    .filter(([perfilId]) => !desejados.includes(perfilId))
    .map(([, vincId]) => vincId)
  const adicionar = desejados.filter((id) => !atuaisPorPerfil.has(id))

  if (remover.length) {
    const { error } = await admin
      .from("usuario_perfis")
      .delete()
      .in("id", remover)
    if (error) return { erro: `Falha ao remover perfis: ${error.message}` }
  }
  if (adicionar.length) {
    const { error } = await admin.from("usuario_perfis").insert(
      adicionar.map((perfilId) => ({
        usuario_id: usuarioId,
        perfil_id: perfilId,
        emp_proprietaria_id: emp,
      }))
    )
    if (error) {
      if (esquemaAusente(error)) return { erro: AVISO_SCHEMA }
      return { erro: `Falha ao atribuir perfis: ${error.message}` }
    }
  }
  return { ok: true }
}

// ── Escrita: CRUD de perfis ──────────────────────────────────────────────────

/** Zera o padrão de onboarding dos outros perfis do tenant (unicidade). */
async function limparOutrosPadroes(
  emp: string,
  excetoId?: string
): Promise<void> {
  const admin = await createAdminClient()
  let q = admin
    .from("perfis")
    .update({ padrao_onboarding: false })
    .eq("emp_proprietaria_id", emp)
    .eq("padrao_onboarding", true)
  if (excetoId) q = q.neq("id", excetoId)
  await q
}

export async function salvarPerfil(dados: {
  id?: string
  nome: string
  descricao?: string | null
  alcadaAprovacao?: number | null
  ativo: boolean
  padraoOnboarding?: boolean
}): Promise<ResultadoAcao> {
  const nome = texto(dados.nome)
  if (!nome) return { erro: "Informe o nome do perfil." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const padrao = dados.padraoOnboarding === true
  const registro = {
    nome,
    descricao: texto(dados.descricao),
    alcada_aprovacao:
      typeof dados.alcadaAprovacao === "number" ? dados.alcadaAprovacao : null,
    ativo: dados.ativo,
    padrao_onboarding: padrao,
  }

  // Só pode haver um padrão por tenant — zera os demais antes de gravar.
  if (padrao) await limparOutrosPadroes(emp, dados.id)

  if (dados.id) {
    const { error } = await admin
      .from("perfis")
      .update({ ...registro, updated_at: new Date().toISOString() })
      .eq("id", dados.id)
      .eq("emp_proprietaria_id", emp)
    if (error) return { erro: `Falha ao salvar perfil: ${error.message}` }
    return { ok: true, id: dados.id }
  }

  const { data, error } = await admin
    .from("perfis")
    .insert({
      ...registro,
      sistema: false,
      concede_tudo: false,
      emp_proprietaria_id: emp,
    })
    .select("id")
    .single()
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SCHEMA }
    return { erro: `Falha ao criar perfil: ${error.message}` }
  }
  return { ok: true, id: (data as { id: string }).id }
}

/** Id do perfil padrão de onboarding do tenant (ou null se nenhum). */
export async function perfilPadraoOnboarding(): Promise<string | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("perfis")
    .select("id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("padrao_onboarding", true)
    .eq("ativo", true)
    .maybeSingle()
  if (error) return null
  return data ? String(data.id) : null
}

/** Garante que o usuário tenha o perfil padrão (idempotente; no-op se nenhum). */
export async function garantirPerfilPadrao(usuarioId: string): Promise<void> {
  const perfilId = await perfilPadraoOnboarding()
  if (!perfilId) return
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: existe } = await admin
    .from("usuario_perfis")
    .select("id")
    .eq("usuario_id", usuarioId)
    .eq("perfil_id", perfilId)
    .maybeSingle()
  if (existe) return
  await admin.from("usuario_perfis").insert({
    usuario_id: usuarioId,
    perfil_id: perfilId,
    emp_proprietaria_id: emp,
  })
}

/** Substitui as chaves concedidas por um perfil. */
export async function salvarChavesPerfil(
  perfilId: string,
  chaves: string[]
): Promise<ResultadoAcao> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  // Confirma que o perfil é do tenant.
  const { data: perfil } = await admin
    .from("perfis")
    .select("id")
    .eq("id", perfilId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!perfil) return { erro: "Perfil não encontrado." }

  const limpas = [...new Set(chaves.filter((c) => CHAVES_VALIDAS.has(c)))]

  const { error: eDel } = await admin
    .from("perfil_permissoes")
    .delete()
    .eq("perfil_id", perfilId)
  if (eDel) return { erro: `Falha ao limpar permissões: ${eDel.message}` }

  if (limpas.length) {
    const { error } = await admin.from("perfil_permissoes").insert(
      limpas.map((chave) => ({
        perfil_id: perfilId,
        chave,
        emp_proprietaria_id: emp,
      }))
    )
    if (error) return { erro: `Falha ao salvar permissões: ${error.message}` }
  }
  return { ok: true, id: perfilId }
}

export async function excluirPerfil(id: string): Promise<ResultadoAcao> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: perfil } = await admin
    .from("perfis")
    .select("id, sistema")
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!perfil) return { erro: "Perfil não encontrado." }
  if (perfil.sistema === true) {
    return {
      erro: "Perfil de fábrica não pode ser excluído — desative-o se necessário.",
    }
  }
  const { error } = await admin
    .from("perfis")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: `Falha ao excluir perfil: ${error.message}` }
  return { ok: true }
}
