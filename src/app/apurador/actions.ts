"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"

import { mascararEmail, type EstadoForm } from "@/lib/contas"
import {
  concluirApuracaoUrna,
  emailEhApurador,
  iniciarApuracaoUrna,
  salvarContagemUrna,
  type ContagemLinha,
} from "@/lib/db/votacao-apuracao"
import { createClient } from "@/lib/supabase/server"

// ── Login do apurador (OTP por e-mail) ──────────────────────────────────────

export async function enviarCodigoApurador(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { erro: "Informe um e-mail válido." }
  }
  if (!(await emailEhApurador(email))) {
    return {
      erro: "Este e-mail não está cadastrado como apurador. Fale com a organização.",
    }
  }
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, data: { tipo: "apurador" } },
  })
  if (error) return { erro: "Não foi possível enviar o código. Tente de novo." }
  return { ok: `Código enviado para ${mascararEmail(email)}. Digite-o abaixo.` }
}

export async function confirmarCodigoApurador(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  const token = String(formData.get("token") ?? "").trim()
  if (!/^\d{6,10}$/.test(token)) return { erro: "Código inválido." }
  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" })
  if (error) return { erro: "Código inválido ou expirado." }
  redirect("/apurador")
}

export async function sairApurador(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/apurador")
}

// ── Apuração da urna ────────────────────────────────────────────────────────

export async function iniciarApuracaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const urnaId = String(formData.get("urna_id") ?? "")
  const lacresOk = String(formData.get("lacres_ok") ?? "") === "on"
  const obs = String(formData.get("lacres_observacao") ?? "").trim() || null
  if (!urnaId) return { erro: "Urna inválida." }
  const r = await iniciarApuracaoUrna(urnaId, {
    lacresOk,
    lacresObservacao: obs,
  })
  if (r.erro) return { erro: r.erro }
  revalidatePath(`/apurador/urna/${urnaId}`)
  return { ok: "Apuração iniciada. Lance a contagem abaixo." }
}

export async function salvarContagemAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const urnaId = String(formData.get("urna_id") ?? "")
  if (!urnaId) return { erro: "Urna inválida." }
  // Campos: c_<perguntaId>_<opcaoId|branco|nulo> = quantidade
  const contagens: ContagemLinha[] = []
  for (const [chave, valor] of formData.entries()) {
    if (!chave.startsWith("c_") || typeof valor !== "string") continue
    const resto = chave.slice(2)
    const sep = resto.lastIndexOf("__")
    if (sep < 0) continue
    const perguntaId = resto.slice(0, sep)
    const alvo = resto.slice(sep + 2)
    const q = Number(valor)
    if (!Number.isFinite(q) || q < 0) continue
    if (alvo === "branco" || alvo === "nulo") {
      contagens.push({ perguntaId, opcaoId: null, tipo: alvo, quantidade: q })
    } else {
      contagens.push({ perguntaId, opcaoId: alvo, tipo: "opcao", quantidade: q })
    }
  }
  const r = await salvarContagemUrna(urnaId, contagens)
  if (r.erro) return { erro: r.erro }
  revalidatePath(`/apurador/urna/${urnaId}`)
  return { ok: "Contagem salva." }
}

export async function concluirApuracaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const urnaId = String(formData.get("urna_id") ?? "")
  if (!urnaId) return { erro: "Urna inválida." }
  const r = await concluirApuracaoUrna(urnaId)
  if (r.erro) return { erro: r.erro }
  revalidatePath(`/apurador/urna/${urnaId}`)
  return { ok: "Apuração da urna concluída." }
}
