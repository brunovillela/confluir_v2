"use server"

import { redirect } from "next/navigation"

import { descreveErroAuth, type EstadoForm } from "@/lib/contas"
import { usuarioHotelDaConta } from "@/lib/db/hospedagem"
import { SITE_URL } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"
import { bloqueioAtivo, chaveDeLogin, limparFalhasLogin, registrarFalhaLogin } from "@/lib/login-bloqueio"
import { exigirHumano, tokenHumano } from "@/lib/turnstile"

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
  const erroHumano = await exigirHumano(formData)
  if (erroHumano) return { erro: erroHumano }
  const chave = chaveDeLogin("senha", email)
  const bloqueio = await bloqueioAtivo(chave)
  if (bloqueio) return { erro: bloqueio }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
    options: { captchaToken: tokenHumano(formData) },
  })
  if (error || !data.user) {
    await registrarFalhaLogin(chave)
    return { erro: "Email ou senha incorretos." }
  }
  await limparFalhasLogin(chave)

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
  const erroHumano = await exigirHumano(formData)
  if (erroHumano) return { erro: erroHumano }

  const { enviarLinkRedefinicao } = await import("@/lib/codigo-acesso")
  const tentativa = await enviarLinkRedefinicao(email, SITE_URL)
  const supabase = await createClient()
  const { error } = tentativa.enviado
    ? { error: null }
    : await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${SITE_URL}/auth/confirm?next=/definir-senha`,
        captchaToken: tokenHumano(formData),
      })

  // Mesma razão do /login: mensagem neutra na tela, erro real no log.
  if (error) {
    console.error(
      "Falha ao enviar recuperação de senha (hotel):",
      descreveErroAuth(error)
    )
  }

  return {
    ok: "Se o email estiver cadastrado, você receberá um link para redefinir a senha.",
  }
}

export async function sairDoHotel() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/hotel")
}
