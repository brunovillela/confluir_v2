"use server"

import { redirect } from "next/navigation"

import { tenantAtual } from "@/lib/tenant"

import {
  buscarFiliadoPorCpf,
  mascararEmail,
  type EstadoForm,
} from "@/lib/contas"
import { limparCpf, validarCpf } from "@/lib/cpf"
import {
  existeAptoPorEmail,
  registrarVotoEleitorEmail,
  registrarVotoFiliado,
} from "@/lib/db/votacao-portal"
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

/** Confirma o token de 6 dígitos e autentica o eleitor, abrindo a cédula. */
export async function confirmarTokenEleitor(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const cpf = limparCpf(String(formData.get("cpf") ?? ""))
  const token = String(formData.get("token") ?? "").trim()
  const assembleiaId = String(formData.get("assembleia_id") ?? "")

  if (!validarCpf(cpf)) return { erro: "CPF inválido." }
  if (!/^\d{6,10}$/.test(token)) return { erro: "Código inválido." }

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

  // Sessão do eleitor criada (user_metadata.cpf) — recarrega a página, que
  // agora mostra a cédula.
  redirect(`/votar/${assembleiaId}`)
}

// ── Não-filiado: identificação por e-mail corporativo do apto ──────────────

/** Envia o código para o e-mail corporativo, se ele estiver na lista de aptos. */
export async function solicitarTokenEmail(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const assembleiaId = String(formData.get("assembleia_id") ?? "")
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { erro: "Informe um e-mail válido." }
  }

  const admin = await createAdminClient()
  const { data: assembleia } = await admin
    .from("voto_assembleias")
    .select("id")
    .eq("id", assembleiaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!assembleia) return { erro: "Assembleia não encontrada." }

  if (!(await existeAptoPorEmail(email, assembleiaId))) {
    return {
      erro: "Este e-mail não está na lista de aptos a votar nesta assembleia.",
    }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, data: { tipo: "eleitor" } },
  })
  if (error) return { erro: "Não foi possível enviar o código. Tente de novo." }

  return {
    ok: `Código enviado para ${mascararEmail(email)}. Digite-o abaixo.`,
  }
}

/** Confirma o token enviado ao e-mail e abre a cédula. */
export async function confirmarTokenEmail(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const token = String(formData.get("token") ?? "").trim()
  const assembleiaId = String(formData.get("assembleia_id") ?? "")
  if (!/^\d{6,10}$/.test(token)) return { erro: "Código inválido." }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  })
  if (error) return { erro: "Código inválido ou expirado." }

  redirect(`/votar/${assembleiaId}`)
}

/**
 * Registra o voto no ambiente público. A identidade vem da SESSÃO criada pelo
 * OTP — nunca de campos crus do formulário. Filiado: CPF em user_metadata.cpf.
 * Não-filiado: o próprio e-mail da conta (verificado). O voto é secreto.
 */
export async function votarPublico(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const assembleiaId = String(formData.get("assembleia_id") ?? "")
  if (!assembleiaId) return { erro: "Assembleia inválida." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const escolhas: { perguntaId: string; opcaoId: string }[] = []
  for (const [chave, valor] of formData.entries()) {
    if (chave.startsWith("p_") && typeof valor === "string" && valor) {
      escolhas.push({ perguntaId: chave.slice(2), opcaoId: valor })
    }
  }

  const cpf = user?.user_metadata?.cpf
  let r: { erro?: string; ok?: boolean }
  if (typeof cpf === "string" && cpf.length === 11) {
    r = await registrarVotoFiliado(cpf, assembleiaId, escolhas)
  } else if (user?.email) {
    r = await registrarVotoEleitorEmail(user.email, assembleiaId, escolhas)
  } else {
    return { erro: "Sessão de votação expirada. Identifique-se novamente." }
  }
  if (r.erro) return { erro: r.erro }
  return { ok: "Voto registrado. Obrigado por participar." }
}
