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
import { diagnosticarCodigoRecusado } from "@/lib/auth-diagnostico"
import { createClient } from "@/lib/supabase/server"


/**
 * Porta 3 — eleitores: CPF + token temporário por email.
 *
 * O template de email "Magic Link" no Supabase precisa exibir {{ .Token }}
 * (o código numérico) para este fluxo — ver README.
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

  // Apto da assembleia: amarrado a ela ou só na rodada dela.
  const { escopoAptos, filtroAptos } = await import("@/lib/db/votacao-escopo")
  const { data: apto } = await admin
    .from("voto_assembleias_aptos")
    .select("id")
    .or(filtroAptos(await escopoAptos(assembleiaId)))
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
  const { enviarCodigoAcesso } = await import("@/lib/codigo-acesso")
  const { erro } = await enviarCodigoAcesso({
    email: filiado.email,
    metadata: { tipo: "filiado", cpf },
    next: `/votar/${assembleiaId}`,
    contexto: "Use o código abaixo para abrir a sua cédula de votação.",
  })
  if (erro) return { erro }

  return {
    ok: `Código enviado para ${mascararEmail(filiado.email)}. Digite-o abaixo.`,
  }
}

/** Confirma o código recebido por e-mail e autentica o eleitor, abrindo a cédula. */
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
  if (error) return { erro: await diagnosticarCodigoRecusado({ erro: error, email: filiado.email, token, fluxo: "votacao_filiado" }) }

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

  const { enviarCodigoAcesso } = await import("@/lib/codigo-acesso")
  const { erro } = await enviarCodigoAcesso({
    email,
    metadata: { tipo: "eleitor" },
    next: `/votar/${assembleiaId}`,
    contexto: "Use o código abaixo para abrir a sua cédula de votação.",
  })
  if (erro) return { erro }

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
  if (error) return { erro: await diagnosticarCodigoRecusado({ erro: error, email: email, token, fluxo: "votacao_corporativo" }) }

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

  // Quem entrou pelo LINK PESSOAL: identidade no cookie assinado (apto).
  const { eleitorPorLink } = await import("@/lib/acesso-eleitor")
  const porLink = await eleitorPorLink(assembleiaId)
  if (porLink) {
    if (porLink.email) {
      const { precisaConfirmarCpf, precisaInformarDados } = await import(
        "@/lib/db/votacao-primeiro-acesso"
      )
      if (!porLink.cpf && (await precisaInformarDados(porLink.email, assembleiaId))) {
        return { erro: "Informe CPF, nome e data de nascimento antes de votar." }
      }
      if (await precisaConfirmarCpf(porLink.email, assembleiaId)) {
        return { erro: "Confirme o seu CPF antes de votar." }
      }
    }
    const { registrarVotoPorLink } = await import("@/lib/db/votacao-portal")
    const rl = await registrarVotoPorLink(porLink.aptoId, assembleiaId, escolhas)
    return rl.erro ? { erro: rl.erro } : { ok: "Voto registrado. Obrigado por participar." }
  }

  const cpf = user?.user_metadata?.cpf
  let r: { erro?: string; ok?: boolean }
  if (typeof cpf === "string" && cpf.length === 11) {
    r = await registrarVotoFiliado(cpf, assembleiaId, escolhas)
  } else if (user?.email) {
    // Sem os dados do primeiro acesso não há voto: é o que impede a mesma
    // pessoa votar pelo e-mail e, de novo, pelo CPF.
    const { precisaConfirmarCpf, precisaInformarDados } = await import(
      "@/lib/db/votacao-primeiro-acesso"
    )
    if (await precisaInformarDados(user.email, assembleiaId)) {
      return { erro: "Informe CPF, nome e data de nascimento antes de votar." }
    }
    if (await precisaConfirmarCpf(user.email, assembleiaId)) {
      return { erro: "Confirme o seu CPF antes de votar." }
    }
    r = await registrarVotoEleitorEmail(user.email, assembleiaId, escolhas)
  } else {
    return { erro: "Sessão de votação expirada. Identifique-se novamente." }
  }
  if (r.erro) return { erro: r.erro }
  return { ok: "Voto registrado. Obrigado por participar." }
}

// ── Primeiro acesso de quem entrou pelo e-mail: CPF, nome e nascimento ──────

/**
 * Antes da cédula, o eleitor identificado só pelo e-mail corporativo informa
 * CPF, nome completo e data de nascimento — é o que evita a mesma pessoa votar
 * pelas duas portas. O e-mail vem da SESSÃO (OTP), nunca do formulário.
 */
export type EstadoDadosEleitor = EstadoForm & {
  /** O que foi digitado — o React 19 limpa o formulário depois da action. */
  valores?: { cpf: string; nome: string; nascimento: string }
  tentativa?: number
}

export async function informarDadosEleitor(
  prev: EstadoDadosEleitor,
  formData: FormData
): Promise<EstadoDadosEleitor> {
  const assembleiaId = String(formData.get("assembleia_id") ?? "")
  const valores = {
    cpf: String(formData.get("cpf") ?? ""),
    nome: String(formData.get("nome") ?? ""),
    nascimento: String(formData.get("nascimento") ?? ""),
  }
  const falha = (erro: string): EstadoDadosEleitor => ({
    erro,
    valores,
    tentativa: (prev.tentativa ?? 0) + 1,
  })
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { eleitorPorLink } = await import("@/lib/acesso-eleitor")
  const porLink = await eleitorPorLink(assembleiaId)
  const email = user?.email ?? porLink?.email ?? null
  if (!email) return falha("Sessão expirada. Identifique-se novamente.")

  const { registrarDadosEleitor } = await import("@/lib/db/votacao-primeiro-acesso")
  const { erro } = await registrarDadosEleitor({ email, assembleiaId, ...valores })
  if (erro) return falha(erro)
  redirect(`/votar/${assembleiaId}`)
}

/**
 * Confirmação do CPF quando a lista já tem o CPF do eleitor (não há primeiro
 * acesso). O e-mail vem da SESSÃO — do OTP ou do link pessoal —, nunca do
 * formulário.
 */
export async function confirmarCpfEleitor(
  prev: EstadoDadosEleitor,
  formData: FormData
): Promise<EstadoDadosEleitor> {
  const assembleiaId = String(formData.get("assembleia_id") ?? "")
  const cpf = String(formData.get("cpf") ?? "")
  const falha = (erro: string): EstadoDadosEleitor => ({
    erro,
    valores: { cpf, nome: "", nascimento: "" },
    tentativa: (prev.tentativa ?? 0) + 1,
  })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { eleitorPorLink } = await import("@/lib/acesso-eleitor")
  const porLink = await eleitorPorLink(assembleiaId)
  const email = user?.email ?? porLink?.email ?? null
  if (!email) return falha("Sessão expirada. Identifique-se novamente.")

  const { confirmarCpfEleitor: confirmar } = await import(
    "@/lib/db/votacao-primeiro-acesso"
  )
  const { erro } = await confirmar({ email, assembleiaId, cpf })
  if (erro) return falha(erro)
  redirect(`/votar/${assembleiaId}`)
}
