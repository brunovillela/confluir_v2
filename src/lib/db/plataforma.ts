import "server-only"
import { texto } from "@/lib/db/comum"

import { enviarEmail } from "@/lib/email"
import { CHAVES_PERMISSAO } from "@/lib/permissoes-catalogo"
import { createServiceClient } from "@/lib/supabase/admin"
import { subdominioReservado } from "@/lib/tenant-host"
import { origemDoTenant } from "@/lib/tenant-url"

/**
 * Camada de PLATAFORMA: gestão dos tenants (organizações) e do admin de cada
 * um. Opera ENTRE tenants — por isso NUNCA usa `tenantAtual()`; cada operação
 * recebe/retorna o id do tenant explicitamente. Só o super-admin chega aqui
 * (ver lib/plataforma.ts). Um tenant é o registro de `empresa` cujo `id` vira
 * `emp_proprietaria_id` nos dados; o `empresa` do próprio tenant tem
 * `emp_proprietaria_id` nulo (ele é o dono, não pertence a outro).
 */

// ── Slug ─────────────────────────────────────────────────────────────────────

/** Normaliza para um slug de subdomínio: minúsculas, a-z0-9 e hífens. */
export function normalizarSlug(bruto: string): string {
  return bruto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
}

export function slugValido(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/.test(slug) && !subdominioReservado(slug)
}

// ── Listagem / detalhe ───────────────────────────────────────────────────────

export type TenantLinha = {
  id: string
  empresaId: string
  slug: string
  status: string
  plano: string | null
  nome: string | null
  criadoEm: string | null
}

export async function listarTenants(): Promise<TenantLinha[]> {
  const admin = createServiceClient()
  const { data, error } = await admin
    .from("tenants")
    .select("id, empresa_id, slug, status, plano, created_at")
    .order("created_at", { ascending: true })
  if (error) throw new Error(`Falha ao listar tenants: ${error.message}`)

  const linhas = (data ?? []) as Record<string, unknown>[]
  const nomes = await nomesDeEmpresas(linhas.map((t) => t.empresa_id as string))
  return linhas.map((t) => ({
    id: t.id as string,
    empresaId: t.empresa_id as string,
    slug: t.slug as string,
    status: t.status as string,
    plano: texto(t.plano),
    nome: nomes.get(t.empresa_id as string) ?? null,
    criadoEm: texto(t.created_at),
  }))
}

async function nomesDeEmpresas(ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return mapa
  const admin = createServiceClient()
  const { data } = await admin
    .from("empresa")
    .select("id, nome_razao, nome_fantasia")
    .in("id", unicos)
  for (const e of data ?? []) {
    const nome = texto(e.nome_razao) ?? texto(e.nome_fantasia)
    if (nome) mapa.set(e.id as string, nome)
  }
  return mapa
}

export type AdminDoTenant = {
  usuarioId: string
  nome: string | null
  email: string | null
  temLogin: boolean
}

export type TenantDetalhe = {
  id: string
  empresaId: string
  slug: string
  status: string
  plano: string | null
  nomeRazao: string | null
  nomeFantasia: string | null
  cnpjCpf: string | null
  criadoEm: string | null
  /** Admins do tenant = usuários com a permissão `permissoes` (gerir acessos). */
  admins: AdminDoTenant[]
}

export async function obterTenant(id: string): Promise<TenantDetalhe | null> {
  const admin = createServiceClient()
  const { data: t } = await admin
    .from("tenants")
    .select("id, empresa_id, slug, status, plano, created_at")
    .eq("id", id)
    .maybeSingle()
  if (!t) return null

  const empresaId = t.empresa_id as string
  const { data: e } = await admin
    .from("empresa")
    .select("nome_razao, nome_fantasia, cnpj_cpf")
    .eq("id", empresaId)
    .maybeSingle()

  // Admins: quem tem a flag `permissoes` (gestão de acessos) no tenant.
  const { data: perms } = await admin
    .from("permissoes")
    .select("usuario_id")
    .eq("emp_proprietaria_id", empresaId)
    .eq("permissoes", true)
    .not("usuario_id", "is", null)
  const ids = (perms ?? []).map((p) => p.usuario_id as string).filter(Boolean)
  const admins: AdminDoTenant[] = []
  if (ids.length > 0) {
    const { data: us } = await admin
      .from("usuarios")
      .select("id, nome_completo, nome_guerra, email, auth_user_id")
      .in("id", ids)
    for (const u of us ?? []) {
      admins.push({
        usuarioId: u.id as string,
        nome: texto(u.nome_completo) ?? texto(u.nome_guerra),
        email: texto(u.email),
        temLogin: Boolean(u.auth_user_id),
      })
    }
  }

  return {
    id: t.id as string,
    empresaId,
    slug: t.slug as string,
    status: t.status as string,
    plano: texto(t.plano),
    nomeRazao: texto(e?.nome_razao),
    nomeFantasia: texto(e?.nome_fantasia),
    cnpjCpf: texto(e?.cnpj_cpf),
    criadoEm: texto(t.created_at),
    admins,
  }
}

// ── Criação ──────────────────────────────────────────────────────────────────

export type DadosNovoTenant = {
  nome_razao: string
  nome_fantasia: string | null
  cnpj_cpf: string | null
  slug: string
  plano: string | null
  status: string
  admin_nome: string
  admin_email: string
}

export type ResultadoNovoTenant = {
  tenantId?: string
  /** Link de definição de senha do admin (compartilhar se o e-mail falhar). */
  link?: string
  emailEnviado?: boolean
  erro?: string
  /** Erro só no convite — o tenant foi criado mesmo assim. */
  avisoConvite?: string
}

/**
 * Cria um tenant e o seu admin: empresa (org) → tenants (slug) → usuário admin
 * → permissões de admin (todas as flags) → convite de acesso. Sem transações
 * no PostgREST: em falha nas etapas estruturais faz limpeza reversa; a falha
 * só no convite mantém o tenant e devolve um aviso.
 */
export async function criarTenant(
  dados: DadosNovoTenant
): Promise<ResultadoNovoTenant> {
  const admin = createServiceClient()

  const slug = normalizarSlug(dados.slug)
  if (!slugValido(slug)) {
    return { erro: "Subdomínio inválido (use letras, números e hífens)." }
  }
  const email = texto(dados.admin_email)
  if (!email) return { erro: "Informe o e-mail do administrador." }
  if (!texto(dados.admin_nome)) return { erro: "Informe o nome do administrador." }
  if (!texto(dados.nome_razao)) return { erro: "Informe a razão social." }

  const { data: slugEmUso } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle()
  if (slugEmUso) return { erro: `O subdomínio “${slug}” já está em uso.` }

  // 1) Organização (empresa) — dona do próprio tenant (emp_proprietaria_id nulo).
  const { data: emp, error: eEmp } = await admin
    .from("empresa")
    .insert({
      nome_razao: dados.nome_razao,
      nome_fantasia: dados.nome_fantasia,
      cnpj_cpf: dados.cnpj_cpf,
      emp_proprietaria_id: null,
    })
    .select("id")
    .single()
  if (eEmp || !emp) {
    return { erro: `Falha ao criar a organização: ${eEmp?.message ?? "erro"}` }
  }
  const tenantId = emp.id as string

  // 2) Tenant (slug/status/plano)
  const { error: eTen } = await admin.from("tenants").insert({
    empresa_id: tenantId,
    slug,
    status: dados.status,
    plano: dados.plano,
  })
  if (eTen) {
    await admin.from("empresa").delete().eq("id", tenantId)
    return { erro: `Falha ao registrar o tenant: ${eTen.message}` }
  }

  // 3) Usuário admin do tenant
  const { data: usr, error: eUsr } = await admin
    .from("usuarios")
    .insert({
      nome_completo: dados.admin_nome,
      email,
      emp_proprietaria_id: tenantId,
    })
    .select("id")
    .single()
  if (eUsr || !usr) {
    await admin.from("tenants").delete().eq("empresa_id", tenantId)
    await admin.from("empresa").delete().eq("id", tenantId)
    return { erro: `Falha ao criar o administrador: ${eUsr?.message ?? "erro"}` }
  }
  const usuarioId = usr.id as string

  // 4) Permissões de admin — todas as flags do catálogo ligadas.
  const flags = Object.fromEntries(CHAVES_PERMISSAO.map((c) => [c, true]))
  const { error: ePerm } = await admin.from("permissoes").insert({
    usuario_id: usuarioId,
    emp_proprietaria_id: tenantId,
    ...flags,
  })
  if (ePerm) {
    await admin.from("usuarios").delete().eq("id", usuarioId)
    await admin.from("tenants").delete().eq("empresa_id", tenantId)
    await admin.from("empresa").delete().eq("id", tenantId)
    return { erro: `Falha ao definir as permissões: ${ePerm.message}` }
  }

  // 5) Convite de acesso (cria a conta de auth + link). Falha aqui NÃO desfaz
  //    o tenant — o admin pode reenviar o convite depois.
  // O convite aponta para o SUBDOMÍNIO do tenant recém-criado — é lá que o
  // admin define a senha e entra.
  const redirectSenha = `${origemDoTenant(slug)}/auth/confirm?next=/definir-senha`
  const { data: convite, error: eConvite } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { tipo: "funcionario" }, redirectTo: redirectSenha },
  })
  if (eConvite || !convite?.user) {
    const jaExiste = /registered|already/i.test(eConvite?.message ?? "")
    return {
      tenantId,
      avisoConvite: jaExiste
        ? "Tenant criado. Já existe uma conta com este e-mail — envie um link de redefinição pela tela do admin."
        : `Tenant criado, mas o convite falhou: ${eConvite?.message ?? "erro"}.`,
    }
  }
  await admin
    .from("usuarios")
    .update({ auth_user_id: convite.user.id })
    .eq("id", usuarioId)

  const link = convite.properties?.action_link ?? undefined
  const primeiroNome = dados.admin_nome.split(" ")[0]
  const emailEnviado = link
    ? await enviarEmail({
        email,
        nome: dados.admin_nome,
        assunto: "Acesso ao Confluir",
        html: `<p>Olá, ${primeiroNome}!</p><p>Sua organização foi criada no Confluir e você é o administrador. Defina sua senha para entrar:</p><p><a href="${link}">Definir minha senha</a></p>`,
      })
    : false

  return { tenantId, link, emailEnviado }
}

// ── Edição ───────────────────────────────────────────────────────────────────

export type DadosEdicaoTenant = {
  nome_razao: string
  nome_fantasia: string | null
  cnpj_cpf: string | null
  slug: string
  plano: string | null
  status: string
}

export async function atualizarTenant(
  id: string,
  dados: DadosEdicaoTenant
): Promise<{ erro?: string }> {
  const admin = createServiceClient()
  const { data: t } = await admin
    .from("tenants")
    .select("empresa_id")
    .eq("id", id)
    .maybeSingle()
  if (!t) return { erro: "Tenant não encontrado." }
  const empresaId = t.empresa_id as string

  const slug = normalizarSlug(dados.slug)
  if (!slugValido(slug)) return { erro: "Subdomínio inválido." }
  const { data: conflito } = await admin
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .neq("id", id)
    .maybeSingle()
  if (conflito) return { erro: `O subdomínio “${slug}” já está em uso.` }

  const { error: eTen } = await admin
    .from("tenants")
    .update({ slug, status: dados.status, plano: dados.plano, updated_at: new Date().toISOString() })
    .eq("id", id)
  if (eTen) return { erro: `Falha ao salvar o tenant: ${eTen.message}` }

  const { error: eEmp } = await admin
    .from("empresa")
    .update({
      nome_razao: dados.nome_razao,
      nome_fantasia: dados.nome_fantasia,
      cnpj_cpf: dados.cnpj_cpf,
      updated_at: new Date().toISOString(),
    })
    .eq("id", empresaId)
  if (eEmp) return { erro: `Tenant salvo, mas a organização falhou: ${eEmp.message}` }
  return {}
}
