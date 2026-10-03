"use server"

import { redirect } from "next/navigation"

import { bloqueioAtivo, limparFalhasLogin, registrarFalhaLogin } from "@/lib/login-bloqueio"
import { createClient } from "@/lib/supabase/server"

export type EstadoCadastro2FA = {
  erro?: string
  fatorId?: string
  qr?: string
  segredo?: string
}

const NOME_FATOR = "Aplicativo autenticador"

/**
 * Passo 1: cria o fator TOTP (ainda não confirmado) e devolve o QR e a chave.
 * Fatores de tentativas anteriores que ficaram sem confirmação são removidos
 * antes — o Supabase recusa dois com o mesmo nome.
 */
export async function iniciarCadastro2FA(): Promise<EstadoCadastro2FA> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const { data: fatores } = await supabase.auth.mfa.listFactors()
  for (const f of fatores?.all ?? []) {
    if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id })
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: NOME_FATOR,
    issuer: "Confluir",
  })
  if (error || !data?.totp) {
    return { erro: "Não foi possível iniciar o cadastro. Tente de novo em instantes." }
  }
  return { fatorId: data.id, qr: data.totp.qr_code, segredo: data.totp.secret }
}

/** Passo 2: o código do aplicativo confirma o fator e eleva a sessão. */
export async function confirmarCadastro2FA(
  _prev: EstadoCadastro2FA,
  formData: FormData
): Promise<EstadoCadastro2FA> {
  const fatorId = String(formData.get("fator_id") ?? "").trim()
  const codigo = String(formData.get("codigo") ?? "").replace(/\D/g, "")
  if (!fatorId || codigo.length !== 6) return { erro: "Digite o código de 6 dígitos." }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const chave = `mfa:${user.id}`
  const bloqueio = await bloqueioAtivo(chave)
  if (bloqueio) return { erro: bloqueio }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fatorId, code: codigo })
  if (error) {
    await registrarFalhaLogin(chave)
    return { erro: "Código inválido. Confira se a hora do celular está certa e tente de novo." }
  }
  await limparFalhasLogin(chave)
  redirect("/conta/seguranca?ok=1")
}

/** Remove o fator. Exige sessão elevada (aal2), como o Supabase impõe. */
export async function desativar2FA(
  _prev: EstadoCadastro2FA,
  formData: FormData
): Promise<EstadoCadastro2FA> {
  const fatorId = String(formData.get("fator_id") ?? "").trim()
  if (!fatorId) return { erro: "Fator inválido." }
  const supabase = await createClient()
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (aal?.currentLevel !== "aal2") {
    redirect(`/login/verificacao?next=${encodeURIComponent("/conta/seguranca")}`)
  }
  const { error } = await supabase.auth.mfa.unenroll({ factorId: fatorId })
  if (error) return { erro: "Não foi possível desativar. Tente de novo." }
  redirect("/conta/seguranca")
}
