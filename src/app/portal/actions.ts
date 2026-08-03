"use server"

import { redirect } from "next/navigation"

import {
  buscarFiliadoPorCpf,
  mascararEmail,
  type EstadoForm,
} from "@/lib/contas"
import { limparCpf, validarCpf } from "@/lib/cpf"
import { SITE_URL } from "@/lib/env"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/** Porta 2 — filiados: CPF + senha. */
export async function loginFiliadoSenha(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const cpf = limparCpf(String(formData.get("cpf") ?? ""))
  const senha = String(formData.get("senha") ?? "")

  if (!validarCpf(cpf)) return { erro: "CPF inválido." }
  if (!senha) return { erro: "Informe sua senha." }

  const filiado = await buscarFiliadoPorCpf(cpf)
  if (!filiado) return { erro: "CPF ou senha incorretos." }
  if (!filiado.email) {
    return {
      erro: "Seu cadastro não possui email. Entre em contato com o sindicato para atualizar seus dados.",
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: filiado.email,
    password: senha,
  })
  if (error || !data.user) return { erro: "CPF ou senha incorretos." }

  // Só informa o status da filiação a quem provou a senha (anti-enumeração).
  if (!filiado.ativo) {
    await supabase.auth.signOut()
    return {
      erro: "Sua filiação não está ativa. Procure o sindicato para regularizar seu cadastro.",
    }
  }

  // A identidade da conta é o CPF em user_metadata.cpf.
  const cpfConta = data.user.user_metadata?.cpf
  if (typeof cpfConta === "string" && cpfConta !== cpf) {
    // Email compartilhado entre pessoas diferentes (dado legado).
    await supabase.auth.signOut()
    return {
      erro: "Esta conta de acesso está vinculada a outro CPF. Procure o sindicato.",
    }
  }
  if (!cpfConta) {
    // Provou posse do email do cadastro deste CPF — vincula a conta ao CPF.
    const admin = await createAdminClient()
    await admin.auth.admin.updateUserById(data.user.id, {
      user_metadata: { ...data.user.user_metadata, tipo: "filiado", cpf },
    })
  }

  redirect("/portal/inicio")
}

/** Porta 2 — filiados: magic link enviado ao email do cadastro. */
export async function enviarMagicLinkFiliado(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const cpf = limparCpf(String(formData.get("cpf") ?? ""))
  if (!validarCpf(cpf)) return { erro: "CPF inválido." }

  // Resposta genérica para não confirmar a existência de CPFs.
  const respostaGenerica = {
    ok: "Se o CPF estiver cadastrado, enviaremos um link de acesso ao email do cadastro.",
  }

  const filiado = await buscarFiliadoPorCpf(cpf)
  if (!filiado || !filiado.email || !filiado.ativo) return respostaGenerica

  // Cria a conta na hora se não existir, já com o CPF como identidade.
  // Se a conta já existe, o metadata original é preservado (o CPF gravado
  // na criação continua valendo — ver getSessaoPortal).
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: filiado.email,
    options: {
      shouldCreateUser: true,
      data: { tipo: "filiado", cpf },
      emailRedirectTo: `${SITE_URL}/auth/confirm?next=/portal/inicio`,
    },
  })
  if (error) {
    return { erro: "Não foi possível enviar o link. Tente novamente." }
  }

  return { ok: `Link de acesso enviado para ${mascararEmail(filiado.email)}.` }
}
