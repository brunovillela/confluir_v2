import "server-only"
import { texto } from "@/lib/db/comum"
import { tenantAtual } from "@/lib/tenant"

import { enviarEmail } from "@/lib/email"
import { garantirPerfilPadrao } from "@/lib/db/perfis"
import { CHAVES_PERMISSAO } from "@/lib/permissoes-catalogo"
import { createAdminClient } from "@/lib/supabase/admin"
import { origemAtual } from "@/lib/tenant-url"

/**
 * Acessos ao painel = registro de `permissoes` ligado a um `usuarios`
 * (usuario_id). Os 81 registros órfãos (usuario_id nulo, migração do Bubble)
 * são ignorados aqui. Login/conta de auth é etapa à parte — aqui só o perfil
 * de permissões (as ~63 flags + alçada). Ver [[confluir-fase-3a]].
 */

function numero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

// ── Lista ───────────────────────────────────────────────────────────────────

export type AcessoLinha = {
  id: string
  usuarioId: string | null
  nome: string | null
  email: string | null
  temLogin: boolean
  totalPermissoes: number
  ehAdmin: boolean
}

export async function listarAcessos(): Promise<AcessoLinha[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("permissoes")
    .select("*")
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("usuario_id", "is", null)

  const linhas = (data ?? []) as Record<string, unknown>[]
  const usuarioIds = linhas.map((p) => p.usuario_id as string).filter(Boolean)
  const usuarios = await usuariosPorId(usuarioIds)

  return linhas
    .map((p) => {
      const u = usuarios.get(p.usuario_id as string)
      return {
        id: p.id as string,
        usuarioId: texto(p.usuario_id),
        nome: u?.nome ?? null,
        email: u?.email ?? null,
        temLogin: u?.temLogin ?? false,
        totalPermissoes: CHAVES_PERMISSAO.filter((c) => p[c] === true).length,
        ehAdmin: p.permissoes === true || p.configuracoes === true,
      }
    })
    .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"))
}

type UsuarioInfo = { nome: string | null; email: string | null; temLogin: boolean }

async function usuariosPorId(ids: string[]): Promise<Map<string, UsuarioInfo>> {
  const mapa = new Map<string, UsuarioInfo>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("usuarios")
    .select("id, nome_completo, nome_guerra, email, auth_user_id")
    .in("id", unicos)
  for (const u of data ?? []) {
    mapa.set(u.id as string, {
      nome: texto(u.nome_completo) ?? texto(u.nome_guerra),
      email: texto(u.email),
      temLogin: Boolean(u.auth_user_id),
    })
  }
  return mapa
}

// ── Detalhe ─────────────────────────────────────────────────────────────────

export type DetalheAcesso = {
  id: string
  usuarioId: string | null
  nome: string | null
  email: string | null
  temLogin: boolean
  alcada: number | null
  flags: Record<string, boolean>
}

export async function obterAcesso(id: string): Promise<DetalheAcesso | null> {
  const admin = await createAdminClient()
  const { data: p } = await admin
    .from("permissoes")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!p) return null

  const bruto = p as Record<string, unknown>
  const usuarioId = texto(bruto.usuario_id)
  const info = usuarioId ? await usuariosPorId([usuarioId]) : new Map()

  const flags: Record<string, boolean> = {}
  for (const c of CHAVES_PERMISSAO) flags[c] = bruto[c] === true

  const u = usuarioId ? info.get(usuarioId) : undefined
  return {
    id: p.id as string,
    usuarioId,
    nome: u?.nome ?? null,
    email: u?.email ?? null,
    temLogin: u?.temLogin ?? false,
    alcada: numero(bruto.alcada_aprovacao),
    flags,
  }
}

// ── Escrita ─────────────────────────────────────────────────────────────────

export async function atualizarAcesso(
  id: string,
  flags: Record<string, boolean>,
  alcada: number | null
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  // Só grava chaves conhecidas do catálogo (evita coluna inesperada).
  const patch: Record<string, unknown> = { alcada_aprovacao: alcada }
  for (const c of CHAVES_PERMISSAO) patch[c] = flags[c] === true
  patch.modified_at = new Date().toISOString()

  const { error } = await admin
    .from("permissoes")
    .update(patch)
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao salvar permissões: ${error.message}` }
  return {}
}

/**
 * Concede acesso a uma pessoa: cria o registro de `permissoes` ligado ao
 * usuário (se ainda não houver). Todas as flags começam desligadas.
 */
export async function concederAcesso(
  usuarioId: string
): Promise<{ id?: string; erro?: string; jaExistia?: boolean }> {
  const admin = await createAdminClient()
  const { data: existente } = await admin
    .from("permissoes")
    .select("id")
    .eq("usuario_id", usuarioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (existente) return { id: existente.id as string, jaExistia: true }

  const { data, error } = await admin
    .from("permissoes")
    .insert({
      usuario_id: usuarioId,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error) return { erro: `Falha ao conceder acesso: ${error.message}` }
  return { id: data.id as string }
}

export async function revogarAcesso(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("permissoes")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao revogar acesso: ${error.message}` }
  return {}
}

// ── Login / integração (conta de acesso) ────────────────────────────────────

export type ResultadoLogin = {
  erro?: string
  ok?: string
  /** Link para a pessoa definir a senha — mostrar ao admin para compartilhar. */
  link?: string
  emailEnviado?: boolean
}

async function usuarioDoAcesso(acessoId: string) {
  const admin = await createAdminClient()
  const { data: p } = await admin
    .from("permissoes")
    .select("usuario_id")
    .eq("id", acessoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  const usuarioId = texto(p?.usuario_id)
  if (!usuarioId) return null
  const { data: u } = await admin
    .from("usuarios")
    .select("id, nome_completo, nome_guerra, email, auth_user_id")
    .eq("id", usuarioId)
    .maybeSingle()
  return u ?? null
}

/**
 * Concede login: cria a conta de acesso (convite) e vincula o auth_user_id.
 * Devolve o link de definição de senha (o e-mail é best-effort — sem BREVO/SMTP
 * o admin compartilha o link manualmente).
 */
export async function concederLogin(acessoId: string): Promise<ResultadoLogin> {
  const admin = await createAdminClient()
  const u = await usuarioDoAcesso(acessoId)
  if (!u) return { erro: "Usuário do acesso não encontrado." }
  if (u.auth_user_id) return { erro: "Esta pessoa já tem conta de login." }
  const email = texto(u.email)
  if (!email) {
    return { erro: "O usuário não tem e-mail cadastrado — cadastre um e-mail antes." }
  }

  const redirectSenha = `${await origemAtual()}/auth/confirm?next=/definir-senha`
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { tipo: "funcionario" }, redirectTo: redirectSenha },
  })
  if (error || !data.user) {
    const jaExiste = /registered|already/i.test(error?.message ?? "")
    return {
      erro: jaExiste
        ? "Já existe uma conta com este e-mail. Use 'gerar link de redefinição'."
        : `Não foi possível criar o acesso: ${error?.message ?? "erro"}`,
    }
  }

  await admin
    .from("usuarios")
    .update({ auth_user_id: data.user.id })
    .eq("id", u.id)

  const link = data.properties?.action_link ?? undefined
  const nome = texto(u.nome_completo) ?? texto(u.nome_guerra)
  const emailEnviado = link
    ? await enviarEmail({
        email,
        nome,
        assunto: "Acesso ao Confluir — {ENTIDADE}",
        html: `<p>Olá${nome ? `, ${nome.split(" ")[0]}` : ""}!</p><p>Seu acesso ao painel do Confluir foi liberado. Defina sua senha para entrar:</p><p><a href="${link}">Definir minha senha</a></p><p>Confluir — {ENTIDADE}</p>`,
      })
    : false

  return {
    ok: emailEnviado
      ? "Acesso criado e convite enviado por e-mail."
      : "Acesso criado. Compartilhe o link abaixo com a pessoa.",
    link,
    emailEnviado,
  }
}

/** Gera um link de redefinição de senha (para quem já tem conta). */
export async function gerarLinkRecuperacao(
  acessoId: string
): Promise<ResultadoLogin> {
  const admin = await createAdminClient()
  const u = await usuarioDoAcesso(acessoId)
  if (!u) return { erro: "Usuário do acesso não encontrado." }
  if (!u.auth_user_id) return { erro: "Esta pessoa ainda não tem conta de login." }
  const email = texto(u.email)
  if (!email) return { erro: "O usuário não tem e-mail cadastrado." }

  const redirectSenha = `${await origemAtual()}/auth/confirm?next=/definir-senha`
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: redirectSenha },
  })
  if (error || !data.properties?.action_link) {
    return { erro: `Não foi possível gerar o link: ${error?.message ?? "erro"}` }
  }
  const link = data.properties.action_link
  const nome = texto(u.nome_completo) ?? texto(u.nome_guerra)
  const emailEnviado = await enviarEmail({
    email,
    nome,
    assunto: "Redefinição de senha — Confluir",
    html: `<p>Olá${nome ? `, ${nome.split(" ")[0]}` : ""}!</p><p>Use o link abaixo para redefinir sua senha do Confluir:</p><p><a href="${link}">Redefinir senha</a></p>`,
  })
  return {
    ok: emailEnviado
      ? "Link enviado por e-mail."
      : "Link gerado. Compartilhe com a pessoa.",
    link,
    emailEnviado,
  }
}

// ── Busca de usuários (para conceder acesso) ────────────────────────────────

export type SugestaoUsuario = {
  id: string
  nome_completo: string | null
  cpf: string | null
  matricula_sindical: string | null
  filiacao_condicao: string | null
}

/** Sugere usuários ativos por nome ou CPF (formato compatível com FiliadoPicker). */
export async function sugerirUsuarios(
  busca: string,
  limite = 8
): Promise<SugestaoUsuario[]> {
  const termo = busca.trim()
  if (termo.length < 3) return []
  const admin = await createAdminClient()
  const digitos = termo.replace(/\D/g, "")

  let query = admin
    .from("usuarios")
    .select("id, nome_completo, cpf")
    .eq("emp_proprietaria_id", await tenantAtual())
    .neq("inativo", true)
    .neq("deletado", true)

  query =
    digitos.length >= 3
      ? query.ilike("cpf", `%${digitos}%`)
      : query.ilike("nome_completo", `%${termo}%`)

  const { data } = await query
    .order("nome_completo", { ascending: true, nullsFirst: false })
    .limit(limite)

  return (data ?? []).map((u) => ({
    id: u.id as string,
    nome_completo: texto(u.nome_completo),
    cpf: texto(u.cpf),
    matricula_sindical: null,
    filiacao_condicao: null,
  }))
}

// ── Onboarding em lote ───────────────────────────────────────────────────────

/**
 * Funcionários do quadro identificados pelo vínculo institucional. Os perfis de
 * `permissoes` migrados do Bubble vieram órfãos (usuario_id/usuario_raw nulos),
 * então o público do onboarding vem de `usuarios.vinculo_instituicao`, não da
 * tabela de permissões. Cada convidado recebe um perfil de permissões VAZIO
 * (login + autosserviço); os módulos são liberados depois, um a um.
 */
const VINCULOS_ONBOARDING = [
  "Funcionário(a)",
  "Diretor(a)",
  "Prestador(a) de serviço",
]

/** E-mail (BREVO) configurado? O disparo do lote depende disso. */
export function emailConfigurado(): boolean {
  return Boolean(process.env.BREVO_API_KEY && process.env.EMAIL_REMETENTE)
}

export type CandidatoOnboarding = {
  usuarioId: string
  nome: string | null
  email: string | null
  vinculo: string | null
}

export type PreviaOnboarding = {
  emailConfigurado: boolean
  /** Ativos, com e-mail, ainda sem login — vão receber convite. */
  aptos: CandidatoOnboarding[]
  /** Já têm conta de login (pulados). */
  jaComLogin: number
  /** Ativos sem e-mail — não dá para convidar (precisa cadastrar e-mail). */
  semEmail: CandidatoOnboarding[]
}

export async function previaOnboarding(): Promise<PreviaOnboarding> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("usuarios")
    .select(
      "id, nome_completo, nome_guerra, email, vinculo_instituicao, auth_user_id"
    )
    .in("vinculo_instituicao", VINCULOS_ONBOARDING)
    .not("inativo", "is", true)
    .not("deletado", "is", true)
    .eq("emp_proprietaria_id", await tenantAtual())

  const linhas = (data ?? []) as Record<string, unknown>[]
  const aptos: CandidatoOnboarding[] = []
  const semEmail: CandidatoOnboarding[] = []
  let jaComLogin = 0

  for (const u of linhas) {
    if (u.auth_user_id) {
      jaComLogin++
      continue
    }
    const cand: CandidatoOnboarding = {
      usuarioId: u.id as string,
      nome: texto(u.nome_completo) ?? texto(u.nome_guerra),
      email: texto(u.email),
      vinculo: texto(u.vinculo_instituicao),
    }
    if (cand.email) aptos.push(cand)
    else semEmail.push(cand)
  }
  const ordenar = (a: CandidatoOnboarding, b: CandidatoOnboarding) =>
    (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR")
  aptos.sort(ordenar)
  semEmail.sort(ordenar)

  return { emailConfigurado: emailConfigurado(), aptos, jaComLogin, semEmail }
}

export type ResultadoOnboarding = {
  /** Contas de login criadas nesta execução. */
  convidados: number
  /** E-mails de convite efetivamente enviados. */
  emails: number
  /** Já tinham login e foram pulados. */
  jaTinham: number
  falhas: { nome: string | null; email: string | null; erro: string }[]
}

/**
 * Convida em lote os funcionários aptos: garante o registro de `permissoes`,
 * atribui o PERFIL PADRÃO de onboarding (se o tenant definiu um; senão entra só
 * com o autosserviço) e cria a conta de login com convite por e-mail. Reusa
 * concederAcesso + garantirPerfilPadrao + concederLogin (idempotentes). Roda
 * numa request (origemAtual/e-mail).
 */
export async function onboardingEmLote(): Promise<ResultadoOnboarding> {
  const previa = await previaOnboarding()
  let convidados = 0
  let emails = 0
  let jaTinham = 0
  const falhas: ResultadoOnboarding["falhas"] = []

  for (const c of previa.aptos) {
    const acesso = await concederAcesso(c.usuarioId)
    if (acesso.erro || !acesso.id) {
      falhas.push({
        nome: c.nome,
        email: c.email,
        erro: acesso.erro ?? "Falha ao criar o perfil de permissões.",
      })
      continue
    }
    // Atribui o perfil padrão de onboarding (no-op se o tenant não definiu um).
    await garantirPerfilPadrao(c.usuarioId)
    const login = await concederLogin(acesso.id)
    if (login.erro) {
      if (/já tem conta|already/i.test(login.erro)) {
        jaTinham++
      } else {
        falhas.push({ nome: c.nome, email: c.email, erro: login.erro })
      }
      continue
    }
    convidados++
    if (login.emailEnviado) emails++
  }

  return { convidados, emails, jaTinham, falhas }
}
