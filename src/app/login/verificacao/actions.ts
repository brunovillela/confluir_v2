"use server"

import { redirect } from "next/navigation"

import type { EstadoForm } from "@/lib/contas"
import { bloqueioAtivo, limparFalhasLogin, registrarFalhaLogin } from "@/lib/login-bloqueio"
import { destinoSeguro } from "@/lib/mfa"
import { createClient } from "@/lib/supabase/server"

/**
 * Confere o código do aplicativo autenticador e eleva a sessão para aal2.
 * Falhas contam no mesmo bloqueio progressivo do login (5 → 15 min, 10 → 1 h),
 * por conta — um código de 6 dígitos não pode ser chutado à vontade.
 */
export async function verificarSegundoFator(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const fatorId = String(formData.get("fator_id") ?? "").trim()
  const codigo = String(formData.get("codigo") ?? "").replace(/\D/g, "")
  const destino = destinoSeguro(String(formData.get("next") ?? ""), "/painel")
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
    return { erro: "Código inválido ou expirado. Confira a hora do celular e tente de novo." }
  }
  await limparFalhasLogin(chave)
  redirect(destino)
}
