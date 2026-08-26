"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarAcesso,
  concederAcesso,
  concederLogin,
  emailConfigurado,
  gerarLinkRecuperacao,
  onboardingEmLote,
  revogarAcesso,
  type ResultadoLogin,
} from "@/lib/db/acessos"
import { atribuirPerfis } from "@/lib/db/perfis"
import { CHAVES_PERMISSAO } from "@/lib/permissoes-catalogo"

const CHAVE = "permissoes"
const ALT = ["configuracoes"]

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

export async function salvarPerfisUsuarioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const usuarioId = texto(formData, "usuario_id")
  const acessoId = texto(formData, "acesso_id")
  if (!usuarioId) return { erro: "Usuário inválido." }

  const perfilIds = formData
    .getAll("perfil_id")
    .map((v) => String(v))
    .filter(Boolean)

  const r = await atribuirPerfis(usuarioId, perfilIds)
  if ("erro" in r) return { erro: r.erro }
  revalidatePath("/painel/institucional/usuarios")
  if (acessoId) revalidatePath(`/painel/institucional/usuarios/${acessoId}`)
  return { ok: "Perfis atualizados." }
}

export async function concederAcessoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const usuarioId = texto(formData, "usuario_id")
  if (!usuarioId) return { erro: "Selecione a pessoa." }

  const { id, erro } = await concederAcesso(usuarioId)
  if (erro) return { erro }
  revalidatePath("/painel/institucional/usuarios")
  redirect(`/painel/institucional/usuarios/${id}`)
}

export async function salvarPermissoesAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const id = texto(formData, "acesso_id")
  if (!id) return { erro: "Acesso inválido." }

  const flags: Record<string, boolean> = {}
  for (const c of CHAVES_PERMISSAO) flags[c] = formData.get(c) === "1"

  const alcadaTxt = texto(formData, "alcada_aprovacao")
  const alcada = alcadaTxt ? Number(alcadaTxt.replace(",", ".")) : null

  const { erro } = await atualizarAcesso(
    id,
    flags,
    Number.isFinite(alcada) ? alcada : null
  )
  if (erro) return { erro }
  revalidatePath("/painel/institucional/usuarios")
  revalidatePath(`/painel/institucional/usuarios/${id}`)
  return { ok: "Permissões salvas." }
}

export async function concederLoginAction(
  _prev: ResultadoLogin,
  formData: FormData
): Promise<ResultadoLogin> {
  await requirePermissao(CHAVE, ALT)
  const id = texto(formData, "acesso_id")
  if (!id) return { erro: "Acesso inválido." }
  const r = await concederLogin(id)
  if (!r.erro) revalidatePath(`/painel/institucional/usuarios/${id}`)
  return r
}

export async function gerarLinkRecuperacaoAction(
  _prev: ResultadoLogin,
  formData: FormData
): Promise<ResultadoLogin> {
  await requirePermissao(CHAVE, ALT)
  const id = texto(formData, "acesso_id")
  if (!id) return { erro: "Acesso inválido." }
  return gerarLinkRecuperacao(id)
}

export async function onboardingEmLoteAction(): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  // Trava: sem e-mail configurado, criar dezenas de contas sem entregar os
  // convites só geraria links perdidos. Configure o BREVO antes de disparar.
  if (!emailConfigurado()) {
    return {
      erro: "Configure o e-mail (BREVO_API_KEY + EMAIL_REMETENTE) antes de disparar o onboarding em lote.",
    }
  }
  const r = await onboardingEmLote()
  revalidatePath("/painel/institucional/usuarios")
  const partes = [
    `${r.convidados} convite(s) criado(s)`,
    `${r.emails} e-mail(s) enviado(s)`,
    r.jaTinham > 0 ? `${r.jaTinham} já tinham login` : null,
    r.falhas.length > 0 ? `${r.falhas.length} falha(s)` : null,
  ].filter(Boolean)
  return { ok: partes.join(" · ") + "." }
}

export async function revogarAcessoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const id = texto(formData, "acesso_id")
  if (!id) return { erro: "Acesso inválido." }

  const { erro } = await revogarAcesso(id)
  if (erro) return { erro }
  revalidatePath("/painel/institucional/usuarios")
  redirect("/painel/institucional/usuarios")
}
