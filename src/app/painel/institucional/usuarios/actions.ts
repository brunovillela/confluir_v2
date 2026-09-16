"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarAcesso,
  cadastrarPessoa,
  concederAcesso,
  concederLogin,
  emailConfigurado,
  gerarLinkRecuperacao,
  onboardingEmLote,
  obterAcesso,
  revogarAcesso,
  type ResultadoLogin,
  type ResultadoNovaPessoa,
} from "@/lib/db/acessos"
import { listarDepartamentos } from "@/lib/db/compras"
import { definirDepartamentosCompras } from "@/lib/db/compras-acesso"
import { atribuirPerfis } from "@/lib/db/perfis"
import { classificarPessoa } from "@/lib/db/quadro"
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

/**
 * Nova pessoa: cadastra em `usuarios` e já concede o acesso, levando à página
 * dela (perfis e convite). Se a pessoa já existe, devolve quem é para a tela
 * oferecer o acesso a ela em vez de duplicar.
 */
export async function novaPessoaAction(
  _prev: ResultadoNovaPessoa,
  formData: FormData
): Promise<ResultadoNovaPessoa> {
  await requirePermissao(CHAVE, ALT)
  const valores = {
    nome: texto(formData, "nome_completo"),
    cpf: texto(formData, "cpf"),
    email: texto(formData, "email"),
    vinculo: texto(formData, "vinculo_instituicao"),
  }
  const r = await cadastrarPessoa({ ...valores, vinculo: valores.vinculo || null })
  if (r.erro || r.existente || !r.usuarioId) return { ...r, valores }

  const { id, erro } = await concederAcesso(r.usuarioId)
  if (erro) return { erro }
  revalidatePath("/painel/institucional/usuarios")
  redirect(`/painel/institucional/usuarios/${id}?nova=1`)
}

/** Quadro da entidade: grava a classificação de uma pessoa. */
export async function classificarPessoaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(CHAVE, ALT)
  const r = await classificarPessoa({
    usuarioId: texto(formData, "usuario_id"),
    classificacao: texto(formData, "classificacao"),
    excluirVinculos: formData.get("excluir_vinculos") === "on",
  })
  if (r.erro) return { erro: r.erro }
  revalidatePath("/painel/institucional/usuarios/quadro")
  revalidatePath("/painel/pessoal", "layout")
  revalidatePath("/painel")
  return { ok: r.ok }
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

/** Departamentos pelos quais a pessoa compra e vê compras (nenhum = todos). */
export async function salvarDepartamentosComprasAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao(CHAVE, ALT)
  const acessoId = texto(formData, "acesso_id")
  const usuarioId = texto(formData, "usuario_id")
  if (!acessoId || !usuarioId) return { erro: "Acesso inválido." }
  const acesso = await obterAcesso(acessoId)
  if (!acesso || acesso.usuarioId !== usuarioId) return { erro: "Acesso inválido." }

  const validos = new Set((await listarDepartamentos()).map((d) => d.id))
  const escolhidos = formData
    .getAll("departamento_id")
    .map(String)
    .filter((id) => validos.has(id))
  const { erro } = await definirDepartamentosCompras(usuarioId, [...new Set(escolhidos)], sessao.usuario.id)
  if (erro) return { erro }
  revalidatePath(`/painel/institucional/usuarios/${acessoId}`)
  return {
    ok: escolhidos.length
      ? `Compras restritas a ${escolhidos.length} departamento(s).`
      : "Sem restrição: a pessoa alcança todos os departamentos em Compras.",
  }
}
