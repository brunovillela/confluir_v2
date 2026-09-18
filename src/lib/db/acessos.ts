import "server-only"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { tenantAtual } from "@/lib/tenant"

import { linkConfirmacaoEmail } from "@/lib/auth-email-constantes"
import { cpfConfiavel, grafiasDoCpf } from "@/lib/cpf"
import { avisoValidadeLinkHtml, enviarEmail } from "@/lib/email"
import { botaoEmail, linkReserva, tituloEmail } from "@/lib/email-layout"
import { ehContaFuncao, ocupantesAtuais } from "@/lib/db/contas-funcao"
import { garantirPerfilPadrao } from "@/lib/db/perfis"
import {
  CATALOGO_PERMISSOES,
  CHAVES_PERMISSAO,
} from "@/lib/permissoes-catalogo"
import { createAdminClient } from "@/lib/supabase/admin"
import { origemAtual } from "@/lib/tenant-url"
import { VINCULOS_INSTITUICAO } from "@/lib/vinculos-instituicao"

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
  /** Conta do posto (ex.: Recepção), usada por quem o ocupa. */
  contaFuncao: boolean
  /** Numa conta de função, quem ocupa o posto hoje. */
  ocupanteAtual: string | null
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
  const ocupantes = await ocupantesAtuais(
    usuarioIds.filter((id) => usuarios.get(id)?.contaFuncao)
  )

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
        contaFuncao: u?.contaFuncao ?? false,
        ocupanteAtual: ocupantes.get(p.usuario_id as string) ?? null,
      }
    })
    .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"))
}

/**
 * Pessoas do painel e as ÁREAS a que têm acesso — para a IA da Ajuda indicar
 * "quem procurar". Baseado nas permissões DIRETAS (colunas de `permissoes`);
 * admin (permissoes/configuracoes) cobre todas as áreas.
 */
export type PessoaAcesso = { nome: string; areas: string[]; admin: boolean }

export async function pessoasComAcesso(): Promise<PessoaAcesso[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("permissoes")
    .select("*")
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("usuario_id", "is", null)
  const linhas = (data ?? []) as Record<string, unknown>[]
  const usuarios = await usuariosPorId(
    linhas.map((p) => p.usuario_id as string).filter(Boolean)
  )
  const todasAreas = CATALOGO_PERMISSOES.map((a) => a.area)

  const pessoas = linhas
    .map((p) => {
      const u = usuarios.get(p.usuario_id as string)
      const nome = u?.nome
      if (!nome || !u?.temLogin) return null
      const ehAdmin = p.permissoes === true || p.configuracoes === true
      const areas = ehAdmin
        ? todasAreas
        : CATALOGO_PERMISSOES.filter((a) =>
            a.flags.some((f) => p[f.chave] === true)
          ).map((a) => a.area)
      if (areas.length === 0 && !ehAdmin) return null
      return { nome, areas, admin: ehAdmin }
    })
    .filter((x): x is PessoaAcesso => x !== null)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))

  return pessoas
}

type UsuarioInfo = {
  nome: string | null
  email: string | null
  temLogin: boolean
  contaFuncao: boolean
}

async function usuariosPorId(ids: string[]): Promise<Map<string, UsuarioInfo>> {
  const mapa = new Map<string, UsuarioInfo>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return mapa
  const admin = await createAdminClient()
  const colunas = "id, nome_completo, nome_guerra, email, auth_user_id"
  const comConta = await admin
    .from("usuarios")
    .select(`${colunas}, conta_funcao`)
    .in("id", unicos)
  // Sem supabase/contas-funcao.sql ainda: ninguém é conta de função.
  const data: Record<string, unknown>[] | null =
    comConta.error && esquemaAusente(comConta.error)
      ? (await admin.from("usuarios").select(colunas).in("id", unicos)).data
      : comConta.data
  for (const u of data ?? []) {
    mapa.set(u.id as string, {
      nome: texto(u.nome_completo) ?? texto(u.nome_guerra),
      email: texto(u.email),
      temLogin: Boolean(u.auth_user_id),
      contaFuncao: u.conta_funcao === true,
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
  contaFuncao: boolean
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
    contaFuncao: u?.contaFuncao ?? false,
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

// ── Nova pessoa ─────────────────────────────────────────────────────────────

export type PessoaExistente = {
  usuarioId: string
  nome: string | null
  email: string | null
  /** Por que achamos que é ela. */
  motivo: "cpf" | "email"
}

export type ResultadoNovaPessoa = {
  erro?: string
  /** A pessoa já está em `usuarios`: conceder acesso a ela, não cadastrar de novo. */
  existente?: PessoaExistente
  usuarioId?: string
  /** Cadastrada sem acesso próprio (usa uma conta de função): o nome, para o aviso. */
  cadastrado?: string
  /** O que foi digitado, para o formulário não voltar vazio depois de uma recusa. */
  valores?: { nome: string; cpf: string; email: string; vinculo: string }
}

/**
 * Cadastra em `usuarios` quem ainda não está lá — sem isso a pessoa não
 * aparece em "Conceder acesso" e não há como convidá-la. Nenhuma outra tela
 * cria usuários: os que existem vieram da migração do Bubble (12 mil, a maior
 * parte filiados com conta no portal), então a conferência de duplicidade é o
 * centro da função.
 *
 * - CPF (obrigatório e válido) já em `usuarios` → devolve a pessoa existente.
 * - E-mail já em `usuarios`: sem CPF lá, é provavelmente a mesma pessoa
 *   (cadastro antigo) → existente; com outro CPF → erro, porque o login é
 *   pelo e-mail e duas pessoas não podem dividi-lo.
 * - `emailOpcional`: quem não terá acesso próprio (usa uma conta de função,
 *   como recepcao@) pode ficar sem e-mail; informado, passa pelas mesmas regras.
 */
export async function cadastrarPessoa(dados: {
  nome: string
  cpf: string
  email: string
  vinculo: string | null
  emailOpcional?: boolean
}): Promise<ResultadoNovaPessoa> {
  const nome = dados.nome.trim().replace(/\s+/g, " ")
  const email = dados.email.trim().toLowerCase()
  const cpf = cpfConfiavel(dados.cpf)
  if (nome.split(" ").length < 2) return { erro: "Informe o nome completo." }
  if (!cpf) return { erro: "CPF inválido. Confira os dígitos." }
  if (!email && !dados.emailOpcional) return { erro: "Informe o e-mail." }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { erro: "E-mail inválido." }
  const vinculo =
    dados.vinculo && (VINCULOS_INSTITUICAO as readonly string[]).includes(dados.vinculo)
      ? dados.vinculo
      : null

  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data: porCpf } = await admin
    .from("usuarios")
    .select("id, nome_completo, email, deletado")
    .eq("emp_proprietaria_id", emp)
    .in("cpf", grafiasDoCpf(cpf))
    .order("deletado", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (porCpf) {
    if (porCpf.deletado) {
      return { erro: "Este CPF pertence a um cadastro excluído do sistema. Fale com o suporte para reativá-lo." }
    }
    return {
      existente: {
        usuarioId: String(porCpf.id),
        nome: texto(porCpf.nome_completo),
        email: texto(porCpf.email),
        motivo: "cpf",
      },
    }
  }

  const { data: porEmail } = email
    ? await admin
        .from("usuarios")
        .select("id, nome_completo, email, cpf")
        .eq("emp_proprietaria_id", emp)
        .eq("email", email) // os e-mails de usuarios estão todos em minúsculas
        .neq("deletado", true)
        .limit(1)
        .maybeSingle()
    : { data: null }
  if (porEmail) {
    if (await ehContaFuncao(String(porEmail.id))) {
      return {
        erro: `Este e-mail é da conta de função ${texto(porEmail.nome_completo) ?? ""}. Quem ocupa o posto é registrado na página da conta; para o acesso pessoal, use um e-mail só desta pessoa.`,
      }
    }
    if (cpfConfiavel(texto(porEmail.cpf))) {
      return {
        erro: `Este e-mail já é do cadastro de ${texto(porEmail.nome_completo) ?? "outra pessoa"}, com outro CPF. O login é pelo e-mail: use um e-mail só desta pessoa.`,
      }
    }
    return {
      existente: {
        usuarioId: String(porEmail.id),
        nome: texto(porEmail.nome_completo),
        email: texto(porEmail.email),
        motivo: "email",
      },
    }
  }

  const { data, error } = await admin
    .from("usuarios")
    .insert({
      nome_completo: nome,
      cpf,
      email: email || null,
      vinculo_instituicao: vinculo,
      emp_proprietaria_id: emp,
    })
    .select("id")
    .single()
  if (error || !data) return { erro: `Não foi possível cadastrar: ${error?.message ?? "erro"}` }
  return { usuarioId: String(data.id) }
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
  // Quem estava inativo volta a valer: conceder acesso é trazer a pessoa de volta.
  await admin
    .from("usuarios")
    .update({ inativo: false, updated_at: new Date().toISOString() })
    .eq("id", usuarioId)
    .eq("inativo", true)
    .neq("deletado", true)
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

  const origem = await origemAtual()
  const redirectSenha = `${origem}/auth/confirm?next=/definir-senha`
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

  const link = linkConfirmacaoEmail(origem, data.properties)
  const nome = texto(u.nome_completo) ?? texto(u.nome_guerra)
  const emailEnviado = link
    ? await enviarEmail({
        email,
        nome,
        assunto: "Acesso ao Confluir — {ENTIDADE}",
        html: `${tituloEmail("Seu acesso foi liberado")}<p>Olá${nome ? `, ${nome.split(" ")[0]}` : ""}!</p><p>Seu acesso ao painel do Confluir em {ENTIDADE} foi liberado. Defina sua senha para entrar:</p>${botaoEmail(link, "Definir minha senha")}${avisoValidadeLinkHtml(origem)}${linkReserva(link)}`,
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

  const origem = await origemAtual()
  const redirectSenha = `${origem}/auth/confirm?next=/definir-senha`
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: redirectSenha },
  })
  const link = linkConfirmacaoEmail(origem, data.properties)
  if (error || !link) {
    return { erro: `Não foi possível gerar o link: ${error?.message ?? "erro"}` }
  }
  const nome = texto(u.nome_completo) ?? texto(u.nome_guerra)
  const emailEnviado = await enviarEmail({
    email,
    nome,
    assunto: "Redefinição de senha — Confluir",
    html: `${tituloEmail("Redefinição de senha")}<p>Olá${nome ? `, ${nome.split(" ")[0]}` : ""}!</p><p>Use o botão abaixo para redefinir sua senha do Confluir:</p>${botaoEmail(link, "Redefinir senha")}${avisoValidadeLinkHtml(origem)}${linkReserva(link)}`,
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

  const emp = await tenantAtual()

  // Contas de função ficam de fora: aqui se buscam pessoas.
  const buscar = (semContas: boolean) => {
    let query = admin
      .from("usuarios")
      .select("id, nome_completo, cpf")
      .eq("emp_proprietaria_id", emp)
      .neq("inativo", true)
      .neq("deletado", true)
    if (semContas) query = query.not("conta_funcao", "is", true)
    query =
      digitos.length >= 3
        ? query.ilike("cpf", `%${digitos}%`)
        : query.ilike("nome_completo", `%${termo}%`)
    return query
      .order("nome_completo", { ascending: true, nullsFirst: false })
      .limit(limite)
  }
  let { data, error } = await buscar(true)
  if (error && esquemaAusente(error)) ({ data, error } = await buscar(false))

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
const VINCULOS_ONBOARDING = [...VINCULOS_INSTITUICAO]

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
