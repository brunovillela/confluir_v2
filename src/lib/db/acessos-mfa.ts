import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * 2FA visto pela gestão de usuários: saber se a pessoa tem o fator e
 * redefinir quando ela perdeu o celular (apaga os fatores; ela cadastra um
 * novo no próximo acesso). Usa a admin API do Auth, que ignora o tenant —
 * por isso a conta é sempre localizada a partir de `usuarios` DO tenant.
 */

async function authUserIdDoUsuario(usuarioId: string): Promise<string | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("usuarios")
    .select("auth_user_id")
    .eq("id", usuarioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return data?.auth_user_id ? String(data.auth_user_id) : null
}

export async function segundoFatorAtivo(usuarioId: string): Promise<boolean | null> {
  const authId = await authUserIdDoUsuario(usuarioId)
  if (!authId) return null
  const admin = await createAdminClient()
  const { data } = await admin.auth.admin.mfa.listFactors({ userId: authId })
  return (data?.factors ?? []).some((f) => f.status === "verified")
}

export async function redefinirSegundoFator(usuarioId: string): Promise<{ erro?: string; removidos?: number }> {
  const authId = await authUserIdDoUsuario(usuarioId)
  if (!authId) return { erro: "Esta pessoa ainda não tem conta de acesso." }
  const admin = await createAdminClient()
  const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: authId })
  if (error) return { erro: "Não foi possível consultar os fatores da conta." }
  let removidos = 0
  for (const f of data?.factors ?? []) {
    const { error: e } = await admin.auth.admin.mfa.deleteFactor({ id: f.id, userId: authId })
    if (!e) removidos++
  }
  return { removidos }
}
