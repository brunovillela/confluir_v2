"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import {
  escolherPrincipal,
  outrosCadastrosDaPessoa,
  unificarUsuarios,
} from "@/lib/db/usuarios-duplicados"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

export type EstadoUnificacao = { erro?: string; ok?: string }

/**
 * Unifica outro cadastro da mesma pessoa no desta página (ou neste no outro,
 * se só o outro tiver login). A conferência de que o outro é mesmo da pessoa
 * e de quem tem login é refeita aqui, não vem do navegador.
 */
export async function unificarCadastroAction(
  _prev: EstadoUnificacao,
  formData: FormData
): Promise<EstadoUnificacao> {
  const sessao = await requirePermissao("permissoes", ["gestao_sistema"])
  const usuarioId = String(formData.get("usuario_id") ?? "")
  const outroId = String(formData.get("outro_id") ?? "")
  const voltar = String(formData.get("voltar") ?? "")
  if (!usuarioId || !outroId) return { erro: "Cadastro não informado." }

  const outro = (await outrosCadastrosDaPessoa(usuarioId)).find((c) => c.usuarioId === outroId)
  if (!outro) return { erro: "Este cadastro não parece ser da mesma pessoa (ou já foi unificado)." }

  const admin = await createAdminClient()
  const { data: atual } = await admin
    .from("usuarios")
    .select("auth_user_id")
    .eq("id", usuarioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  const escolha = escolherPrincipal(
    { usuarioId, temLogin: Boolean(atual?.auth_user_id) },
    { usuarioId: outro.usuarioId, temLogin: outro.temLogin }
  )
  if ("erro" in escolha) return { erro: escolha.erro }

  const r = await unificarUsuarios(escolha.principal, escolha.secundario, String(sessao.usuario.id))
  if (r.erro) return { erro: r.erro }

  revalidatePath("/painel/gestao/usuarios")
  revalidatePath("/painel/institucional/diretoria", "layout")

  // Na página de um usuário que saiu (o outro tinha login), a página dele não
  // existe mais: vai para a do cadastro que ficou.
  if (voltar.startsWith("/painel/gestao/usuarios/") && escolha.principal !== usuarioId) {
    const { data: acesso } = await admin
      .from("permissoes")
      .select("id")
      .eq("usuario_id", escolha.principal)
      .maybeSingle()
    redirect(acesso ? `/painel/gestao/usuarios/${acesso.id}` : "/painel/gestao/usuarios")
  }
  if (voltar.startsWith("/painel/")) revalidatePath(voltar)
  return { ok: "Cadastros unificados." }
}
