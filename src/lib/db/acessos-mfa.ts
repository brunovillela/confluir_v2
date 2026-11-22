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

/**
 * Cache curto (por instância do servidor) da consulta ao Auth: o painel da
 * Gestão confere o 2FA de cada administrador a cada abertura, e a admin API
 * custa uma ida ao Auth por pessoa. 10 minutos bastam para um indicador; a
 * redefinição do fator limpa a entrada da pessoa na hora.
 */
const CACHE_MS = 10 * 60_000
const cache2fa = new Map<string, { valor: boolean | null; ate: number }>()

export async function segundoFatorAtivo(usuarioId: string): Promise<boolean | null> {
  const chave = `${await tenantAtual()}:${usuarioId}`
  const guardado = cache2fa.get(chave)
  if (guardado && guardado.ate > Date.now()) return guardado.valor
  const authId = await authUserIdDoUsuario(usuarioId)
  let valor: boolean | null = null
  if (authId) {
    const admin = await createAdminClient()
    const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: authId })
    // Erro do Auth não vira "sem 2FA" guardado por 10 minutos.
    if (error) return null
    valor = (data?.factors ?? []).some((f) => f.status === "verified")
  }
  cache2fa.set(chave, { valor, ate: Date.now() + CACHE_MS })
  return valor
}

export async function redefinirSegundoFator(usuarioId: string): Promise<{ erro?: string; removidos?: number }> {
  cache2fa.delete(`${await tenantAtual()}:${usuarioId}`)
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

/**
 * Encerra todas as sessões de login da pessoa (todos os aparelhos): ela
 * precisa entrar de novo. Usado ao revogar o acesso e no botão "Encerrar
 * sessões" da ficha. Função encerrar_sessoes_usuario (só service role).
 */
export async function encerrarSessoes(usuarioId: string): Promise<{ erro?: string; encerradas: number }> {
  const admin = await createAdminClient()
  const { data, error } = await admin.rpc("encerrar_sessoes_usuario", { p_emp: await tenantAtual(), p_usuario: usuarioId })
  if (error) return { erro: "Não foi possível encerrar as sessões.", encerradas: 0 }
  return { encerradas: Number(data ?? 0) || 0 }
}
