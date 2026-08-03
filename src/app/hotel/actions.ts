"use server"

import { redirect } from "next/navigation"

import { type EstadoForm } from "@/lib/contas"
import { usuarioHotelDaConta } from "@/lib/db/hospedagem"
import { SITE_URL } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"

/** Porta 4 — pessoal dos hotéis parceiros: email + senha. */
export async function loginHotel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  const senha = String(formData.get("senha") ?? "")

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

  // A conta precisa estar vinculada (e ativa) a um hotel parceiro.
  const vinculo = await usuarioHotelDaConta(data.user.id, data.user.email ?? email)
  if (!vinculo) {
    await supabase.auth.signOut()
    return {
      erro: "Esta conta não está vinculada a um hotel parceiro. Fale com o sindicato.",
    }
  }

  redirect("/hotel/inicio")
}

/** Recuperação de senha (usuários de hotel). */
export async function recuperarSenhaHotel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  if (!email) return { erro: "Informe seu email." }

  const supabase = await createClient()
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${SITE_URL}/auth/confirm?next=/definir-senha`,
  })

  return {
    ok: "Se o email estiver cadastrado, você receberá um link para redefinir a senha.",
  }
}

export async function sairDoHotel() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/hotel")
}
