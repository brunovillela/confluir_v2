"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { mascararEmail, type EstadoForm } from "@/lib/contas"
import { limparCpf, validarCpf } from "@/lib/cpf"
import {
  emailEhMesario,
  parearTerminalMesario,
  registrarPresenca,
  registrarVotoEmSeparado,
} from "@/lib/db/votacao-mesarios"
import { createClient } from "@/lib/supabase/server"

// ── Login do mesário (OTP por e-mail) ───────────────────────────────────────

export async function enviarCodigoMesario(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { erro: "Informe um e-mail válido." }
  }
  if (!(await emailEhMesario(email))) {
    return {
      erro: "Este e-mail não está cadastrado como mesário. Fale com a organização.",
    }
  }
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, data: { tipo: "mesario" } },
  })
  if (error) return { erro: "Não foi possível enviar o código. Tente de novo." }
  return { ok: `Código enviado para ${mascararEmail(email)}. Digite-o abaixo.` }
}

export async function confirmarCodigoMesario(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  const token = String(formData.get("token") ?? "").trim()
  if (!/^\d{6,10}$/.test(token)) return { erro: "Código inválido." }
  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  })
  if (error) return { erro: "Código inválido ou expirado." }
  redirect("/mesario")
}

export async function sairMesario(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/mesario")
}

// ── Operação da urna ────────────────────────────────────────────────────────

export async function parearTerminalAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const urnaId = String(formData.get("urna_id") ?? "")
  const codigo = String(formData.get("codigo") ?? "")
  if (!urnaId || !codigo.trim()) return { erro: "Informe o código do terminal." }
  const r = await parearTerminalMesario(urnaId, codigo)
  if (r.erro) return { erro: r.erro }
  revalidatePath(`/mesario/urna/${urnaId}`)
  return { ok: "Terminal pareado. Já pode liberar as cédulas." }
}

export async function registrarPresencaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const urnaId = String(formData.get("urna_id") ?? "")
  const aptoId = String(formData.get("apto_id") ?? "")
  if (!urnaId || !aptoId) return { erro: "Dados inválidos." }
  const r = await registrarPresenca(urnaId, aptoId)
  if (r.erro) return { erro: r.erro }
  revalidatePath(`/mesario/urna/${urnaId}`)
  return {
    ok: r.liberado
      ? "Presença registrada. Cédula liberada no terminal de votação."
      : "Presença registrada. O eleitor votou na urna.",
  }
}

export type EstadoEmSeparado = {
  erro?: string
  ok?: boolean
  digital?: boolean
  instrucoes?: string[]
}

export async function registrarEmSeparadoAction(
  _prev: EstadoEmSeparado,
  formData: FormData
): Promise<EstadoEmSeparado> {
  const urnaId = String(formData.get("urna_id") ?? "")
  const nome = String(formData.get("nome") ?? "").trim()
  if (!urnaId || !nome) return { erro: "Informe o nome completo." }

  const cpfBruto = String(formData.get("cpf") ?? "").trim()
  let cpf: string | null = null
  if (cpfBruto) {
    cpf = limparCpf(cpfBruto)
    if (!validarCpf(cpf)) return { erro: "CPF inválido." }
  }
  const dataNascimento = String(formData.get("data_nascimento") ?? "").trim() || null
  const telefone = String(formData.get("telefone") ?? "").trim() || null
  const email = String(formData.get("email") ?? "").trim() || null

  const r = await registrarVotoEmSeparado(urnaId, {
    nome,
    cpf,
    dataNascimento,
    telefone,
    email,
  })
  if (r.erro) return { erro: r.erro }
  revalidatePath(`/mesario/urna/${urnaId}`)
  return { ok: true, digital: r.digital, instrucoes: r.instrucoes }
}
