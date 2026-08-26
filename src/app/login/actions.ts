"use server"

import { tenantAtual } from "@/lib/tenant"

import { redirect } from "next/navigation"

import { type EstadoForm } from "@/lib/contas"
import { origemAtual } from "@/lib/tenant-url"
import { PERMISSOES_USUARIO_FK } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/** Porta 1 — funcionários internos: email + senha. */
export async function loginFuncionario(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  const senha = String(formData.get("senha") ?? "")
  const next = String(formData.get("next") ?? "")

  if (!email || !senha) {
    return { erro: "Informe email e senha." }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  })
  if (error || !data.user) {
    return { erro: "Email ou senha incorretos." }
  }

  // Conta autenticada precisa estar vinculada a um funcionário ativo do tenant.
  const admin = await createAdminClient()
  const { data: usuario } = await admin
    .from("usuarios")
    .select("id, inativo, deletado")
    .eq("auth_user_id", data.user.id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()

  if (!usuario) {
    await supabase.auth.signOut()
    return {
      erro: "Esta conta não está vinculada a um funcionário. Filiados devem usar o Portal do Associado.",
    }
  }
  if (usuario.inativo === true || usuario.deletado === true) {
    await supabase.auth.signOut()
    return { erro: "Este cadastro está inativo. Fale com a administração." }
  }

  // `usuarios` contém todas as contas migradas do Bubble — funcionário do
  // sistema é quem tem registro em `permissoes`.
  const { data: permissao } = await admin
    .from("permissoes")
    .select("id")
    .eq(PERMISSOES_USUARIO_FK, usuario.id)
    .maybeSingle()

  if (!permissao) {
    await supabase.auth.signOut()
    return {
      erro: "Sua conta não possui perfil de acesso ao painel. Filiados devem usar o Portal do Associado.",
    }
  }

  redirect(next.startsWith("/painel") ? next : "/painel")
}

/**
 * Primeiro acesso — o funcionário já existe em `usuarios` (dados migrados),
 * mas ainda não tem conta no Supabase Auth. Envia convite por email; o
 * clique leva a /definir-senha.
 */
export async function solicitarPrimeiroAcesso(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  if (!email) return { erro: "Informe seu email." }

  // Resposta genérica para não revelar quais emails existem no cadastro.
  const respostaGenerica = {
    ok: "Se o email estiver cadastrado, você receberá um convite para ativar sua conta.",
  }

  const admin = await createAdminClient()
  const { data: usuario } = await admin
    .from("usuarios")
    .select("id, auth_user_id, inativo, deletado")
    .ilike("email", email)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()

  if (!usuario || usuario.inativo === true || usuario.deletado === true) {
    return respostaGenerica
  }

  // Só funcionários do sistema (com registro em `permissoes`) recebem convite.
  const { data: permissao } = await admin
    .from("permissoes")
    .select("id")
    .eq(PERMISSOES_USUARIO_FK, usuario.id)
    .maybeSingle()
  if (!permissao) return respostaGenerica

  if (usuario.auth_user_id) {
    return {
      erro: "Esta conta já foi ativada. Se esqueceu a senha, use a recuperação de senha.",
    }
  }

  const { data: convite, error } = await admin.auth.admin.inviteUserByEmail(
    email,
    {
      data: { tipo: "funcionario" },
      redirectTo: `${await origemAtual()}/auth/confirm?next=/definir-senha`,
    }
  )
  if (error || !convite.user) {
    return { erro: "Não foi possível enviar o convite. Tente novamente." }
  }

  await admin
    .from("usuarios")
    .update({ auth_user_id: convite.user.id })
    .eq("id", usuario.id)

  return respostaGenerica
}

/** Recuperação de senha (funcionários). */
export async function solicitarRedefinicaoSenha(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  if (!email) return { erro: "Informe seu email." }

  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${await origemAtual()}/auth/confirm?next=/definir-senha`,
  })

  return {
    ok: "Se o email estiver cadastrado, você receberá um link para redefinir a senha.",
  }
}
