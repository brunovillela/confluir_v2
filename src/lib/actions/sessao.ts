"use server"

import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

export async function sairDoPainel() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}

export async function sairDoPortal() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/portal")
}

/** Define/atualiza a senha do usuário logado (pós-convite ou recuperação). */
export async function redefinirSenha(
  _prev: { erro?: string; ok?: string },
  formData: FormData
): Promise<{ erro?: string; ok?: string }> {
  const senha = String(formData.get("senha") ?? "")
  const confirmacao = String(formData.get("confirmacao") ?? "")

  if (senha.length < 8) {
    return { erro: "A senha precisa ter pelo menos 8 caracteres." }
  }
  if (senha !== confirmacao) {
    return { erro: "As senhas não conferem." }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password: senha })
  if (error) {
    return { erro: "Não foi possível salvar a senha. Tente novamente." }
  }

  return { ok: "Senha definida com sucesso." }
}
