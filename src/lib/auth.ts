import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { cache } from "react"
import { redirect } from "next/navigation"
import type { User } from "@supabase/supabase-js"

import { buscarFiliadoPorCpf, type Filiado } from "@/lib/contas"
import {
  usuarioHotelDaConta,
  type Hotel,
  type UsuarioHotel,
} from "@/lib/db/hospedagem"
import {
  PERMISSOES_USUARIO_FK,
  podeAcessar,
  type Permissoes,
} from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/**
 * RLS está habilitado com deny-all para anon/authenticated: toda leitura de
 * dados acontece server-side com o service role. O client anon serve apenas
 * para a sessão de autenticação (cookies).
 *
 * `usuarios` é a tabela de contas migrada do Bubble (11,5k pessoas, não só
 * funcionários) — por isso o acesso ao painel exige registro em `permissoes`
 * (só os funcionários que operam o sistema o possuem).
 */

export type Usuario = {
  id: string
  nome_completo: string | null
  nome_guerra: string | null
  email: string | null
  inativo: boolean | null
  deletado: boolean | null
  [coluna: string]: unknown
}

export type SessaoPainel = {
  user: User
  usuario: Usuario
  permissoes: Permissoes
}

/** Funcionário está apto a usar o painel? */
export function usuarioAtivo(usuario: Pick<Usuario, "inativo" | "deletado">) {
  return usuario.inativo !== true && usuario.deletado !== true
}

/**
 * Sessão do funcionário logado no painel: auth user + registro ativo em
 * `usuarios` + registro em `permissoes` (obrigatório — é ele que define
 * quem é funcionário do sistema). Cacheada por request (React cache).
 */
export const getSessaoPainel = cache(
  async (): Promise<SessaoPainel | null> => {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const admin = await createAdminClient()
    const { data: usuario } = await admin
      .from("usuarios")
      .select("*")
      .eq("auth_user_id", user.id)
      .eq("emp_proprietaria_id", await tenantAtual())
      .maybeSingle()
    if (!usuario || !usuarioAtivo(usuario)) return null

    const { data: permissoes } = await admin
      .from("permissoes")
      .select("*")
      .eq(PERMISSOES_USUARIO_FK, usuario.id)
      .maybeSingle()
    if (!permissoes) return null

    return { user, usuario: usuario as Usuario, permissoes }
  }
)

export async function requireSessaoPainel(): Promise<SessaoPainel> {
  const sessao = await getSessaoPainel()
  if (!sessao) redirect("/login")
  return sessao
}

/** Guarda de página: redireciona se o usuário não tiver a permissão. */
export async function requirePermissao(
  chave: string | null,
  chavesAlternativas: string[] = []
): Promise<SessaoPainel> {
  const sessao = await requireSessaoPainel()
  if (!podeAcessar(sessao.permissoes, chave, chavesAlternativas)) {
    redirect("/painel/sem-acesso")
  }
  return sessao
}

export type SessaoPortal = {
  user: User
  filiado: Filiado
}

/**
 * Sessão do filiado no portal. A identidade é o CPF gravado em
 * `user_metadata.cpf` na criação da conta; os dados vêm de `filiacoes`
 * agregados por CPF (ver contas.ts).
 */
export const getSessaoPortal = cache(
  async (): Promise<SessaoPortal | null> => {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null

    const cpf = user.user_metadata?.cpf
    if (typeof cpf !== "string" || cpf.length !== 11) return null

    const filiado = await buscarFiliadoPorCpf(cpf)
    if (!filiado) return null
    // Portal exige filiação ativa (filiacao_condicao = 'Ativo').
    if (!filiado.ativo) return null

    return { user, filiado }
  }
)

export async function requireSessaoPortal(): Promise<SessaoPortal> {
  const sessao = await getSessaoPortal()
  if (!sessao) redirect("/portal")
  return sessao
}

/**
 * Sessão do TRABALHADOR — filiado OU não-filiado autocadastrado. Usada na área
 * de Oposição à Contribuição Assistencial (portal como hub p/ público não
 * administrativo). O filiado vem de `filiacoes` (ativo); o não-filiado, de
 * `portal_nao_filiado` quando `user_metadata.tipo = 'nao_filiado'`.
 */
export type SessaoTrabalhador = {
  userId: string
  cpf: string
  nome: string | null
  email: string | null
  perfil: "filiado" | "nao_filiado"
  /** id da filiação (perfil filiado) ou do perfil não-filiado. */
  refId: string | null
}

export const getSessaoTrabalhador = cache(
  async (): Promise<SessaoTrabalhador | null> => {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return null
    const cpf = user.user_metadata?.cpf
    if (typeof cpf !== "string" || cpf.length !== 11) return null

    if (user.user_metadata?.tipo === "nao_filiado") {
      const admin = await createAdminClient()
      const { data } = await admin
        .from("portal_nao_filiado")
        .select("id, nome, email")
        .eq("cpf", cpf)
        .eq("emp_proprietaria_id", await tenantAtual())
        .maybeSingle()
      if (!data) return null
      return {
        userId: user.id,
        cpf,
        nome: (data.nome as string | null) ?? null,
        email: (data.email as string | null) ?? null,
        perfil: "nao_filiado",
        refId: String(data.id),
      }
    }

    const filiado = await buscarFiliadoPorCpf(cpf)
    if (!filiado || !filiado.ativo) return null
    return {
      userId: user.id,
      cpf,
      nome: filiado.nome_completo,
      email: filiado.email,
      perfil: "filiado",
      refId: filiado.filiacaoId,
    }
  }
)

export async function requireSessaoTrabalhador(): Promise<SessaoTrabalhador> {
  const sessao = await getSessaoTrabalhador()
  if (!sessao) redirect("/portal/oposicao")
  return sessao
}

export type SessaoHotel = {
  user: User
  usuarioHotel: UsuarioHotel
  hotel: Hotel
}

/**
 * Porta 4 — pessoal dos hotéis parceiros (/hotel). A identidade vem de
 * `hospedagem_hotel_usuarios` (convite enviado pela gestão no painel); o
 * usuário só enxerga cupons e reservas do próprio hotel.
 */
export const getSessaoHotel = cache(async (): Promise<SessaoHotel | null> => {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const vinculo = await usuarioHotelDaConta(user.id, user.email ?? null)
  if (!vinculo) return null

  return { user, ...vinculo }
})

export async function requireSessaoHotel(): Promise<SessaoHotel> {
  const sessao = await getSessaoHotel()
  if (!sessao) redirect("/hotel")
  return sessao
}

export type AreaDaConta = { titulo: string; href: string }

/**
 * Áreas que a conta logada pode acessar (painel, hotel, portal) — para o
 * alternador de interface de quem tem mais de um perfil. Cacheado por request.
 */
export const areasDaConta = cache(async (): Promise<AreaDaConta[]> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return []

  const admin = await createAdminClient()

  const [painel, hotel, portal] = await Promise.all([
    getSessaoPainel().then((s) => !!s),
    (async () => {
      // Tabela ausente ou erro: sem área de hotel.
      const { data, error } = await admin
        .from("hospedagem_hotel_usuarios")
        .select("id")
        .eq("ativo", true)
        .or(
          [
            `auth_user_id.eq.${user.id}`,
            user.email ? `email.ilike.${user.email}` : null,
          ]
            .filter(Boolean)
            .join(",")
        )
        .limit(1)
      return !error && (data ?? []).length > 0
    })(),
    (async () => {
      const cpf = user.user_metadata?.cpf
      if (typeof cpf !== "string" || cpf.length !== 11) return false
      const filiado = await buscarFiliadoPorCpf(cpf)
      return !!filiado?.ativo
    })(),
  ])

  const areas: AreaDaConta[] = []
  if (painel) areas.push({ titulo: "Painel interno", href: "/painel" })
  if (hotel) areas.push({ titulo: "Área do hotel", href: "/hotel/inicio" })
  if (portal) areas.push({ titulo: "Portal do associado", href: "/portal/inicio" })
  return areas
})
