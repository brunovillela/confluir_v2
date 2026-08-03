"use server"

import { tenantAtual } from "@/lib/tenant"

import {
  buscarFiliadoPorCpf,
  mascararEmail,
  type EstadoForm,
} from "@/lib/contas"
import { limparCpf, validarCpf } from "@/lib/cpf"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/**
 * Porta 3 — eleitores: CPF + token temporário por email.
 *
 * O template de email "Magic Link" no Supabase precisa exibir {{ .Token }}
 * (código de 6 dígitos) para este fluxo — ver README.
 */
export async function solicitarTokenEleitor(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const cpf = limparCpf(String(formData.get("cpf") ?? ""))
  const assembleiaId = String(formData.get("assembleia_id") ?? "")

  if (!validarCpf(cpf)) return { erro: "CPF inválido." }

  const admin = await createAdminClient()
  const { data: assembleia } = await admin
    .from("voto_assembleias")
    .select("id")
    .eq("id", assembleiaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!assembleia) return { erro: "Assembleia não encontrada." }

  const { data: apto } = await admin
    .from("voto_assembleias_aptos")
    .select("id")
    .eq("assembleia_id", assembleiaId)
    .eq("cpf", cpf)
    .limit(1)
    .maybeSingle()
  if (!apto) {
    return {
      erro: "Este CPF não está na lista de aptos a votar nesta assembleia.",
    }
  }

  // TODO(Fase 3D): validar janela de votação (inicio/termino da rodada).

  const filiado = await buscarFiliadoPorCpf(cpf)
  if (!filiado || !filiado.email) {
    return {
      erro: "CPF não localizado ou sem email cadastrado. Procure a mesa da assembleia.",
    }
  }
  // Apto na lista, mas a filiação precisa estar ativa para votar.
  if (!filiado.ativo) {
    return {
      erro: "A filiação deste CPF não está ativa. Procure a mesa da assembleia.",
    }
  }

  // Cria a conta na hora se não existir, com o CPF como identidade.
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email: filiado.email,
    options: {
      shouldCreateUser: true,
      data: { tipo: "filiado", cpf },
    },
  })
  if (error) {
    return { erro: "Não foi possível enviar o código. Tente novamente." }
  }

  return {
    ok: `Código enviado para ${mascararEmail(filiado.email)}. Digite-o abaixo.`,
  }
}

/** Confirma o token de 6 dígitos e autentica o eleitor. */
export async function confirmarTokenEleitor(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const cpf = limparCpf(String(formData.get("cpf") ?? ""))
  const token = String(formData.get("token") ?? "").trim()

  if (!validarCpf(cpf)) return { erro: "CPF inválido." }
  if (!/^\d{6}$/.test(token)) return { erro: "O código tem 6 dígitos." }

  // Reconsulta o email server-side — o email real nunca vai ao cliente.
  const filiado = await buscarFiliadoPorCpf(cpf)
  if (!filiado?.email) return { erro: "CPF não localizado." }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    email: filiado.email,
    token,
    type: "email",
  })
  if (error) return { erro: "Código inválido ou expirado." }

  return { ok: "autenticado" }
}
