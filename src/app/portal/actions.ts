"use server"

import { redirect } from "next/navigation"

import {
  buscarFiliadoPorCpf,
  mascararEmail,
  type EstadoForm,
} from "@/lib/contas"
import { registrarVinculoPendente, vincularIdentidade } from "@/lib/auth-identidade"
import { limparCpf, validarCpf } from "@/lib/cpf"
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
  // Cadastro sem e-mail recebe a MESMA resposta de CPF inexistente: a
  // mensagem específica confirmava a quem chutasse CPFs que aquele existe.
  // A orientação "sem e-mail no cadastro? procure o sindicato" fica fixa na
  // tela, para todo mundo.
  if (!filiado || !filiado.email) return { erro: "CPF ou senha incorretos." }

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

  // Provou a senha da conta cujo e-mail é o do cadastro deste CPF: vincula a
  // identidade (ou confirma a existente). Conta já de OUTRO CPF (e-mail
  // compartilhado, dado legado) é recusada — ver lib/auth-identidade.ts.
  const vinculo = await vincularIdentidade({
    userId: data.user.id,
    emailVerificado: data.user.email,
    tipo: "filiado",
    cpf,
    por: "senha",
  })
  if (!vinculo.ok) {
    await supabase.auth.signOut()
    return { erro: vinculo.erro }
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

  // Cria a conta na hora se não existir. O CPF fica como vínculo PENDENTE
  // (e-mail do cadastro ↔ CPF) e vira identidade da conta em /auth/confirm,
  // depois de o link ser aceito — ver lib/auth-identidade.ts.
  await registrarVinculoPendente({ email: filiado.email, tipo: "filiado", cpf })
  const { enviarCodigoAcesso } = await import("@/lib/codigo-acesso")
  const { erro: erroCodigo } = await enviarCodigoAcesso({
    email: filiado.email,
    metadata: { tipo: "filiado" },
    next: "/portal/inicio",
    contexto: "Use o código abaixo para entrar na sua área do filiado.",
  })
  if (erroCodigo) {
    return { erro: "Não foi possível enviar o link. Tente novamente." }
  }

  return { ok: `Link de acesso enviado para ${mascararEmail(filiado.email)}.` }
}
