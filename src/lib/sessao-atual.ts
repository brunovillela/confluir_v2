import "server-only"

import { cache } from "react"
import { createClient as createSupabaseClient, type User } from "@supabase/supabase-js"

import { SUPABASE_URL } from "@/lib/env"
import { createClient } from "@/lib/supabase/server"
import { tenantAtual } from "@/lib/tenant"

/**
 * Quem está agindo nesta requisição — cacheado por request (React cache):
 * uma ida ao Auth e uma ao banco, no máximo, por requisição.
 *
 * Serve ao createAdminClient() para carimbar `x-confluir-usuario` em toda
 * consulta, que o trigger de auditoria lê (supabase/auditoria.sql). Fora de
 * uma requisição com sessão (cron, fluxo público, script) devolve null.
 */
export const authUserAtual = cache(async (): Promise<User | null> => {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return user ?? null
  } catch {
    return null
  }
})

export const usuarioIdAtual = cache(async (): Promise<string | null> => {
  const user = await authUserAtual()
  if (!user) return null
  try {
    const service = createSupabaseClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data } = await service
      .from("usuarios")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("emp_proprietaria_id", await tenantAtual())
      .maybeSingle()
    return data?.id ? String(data.id) : null
  } catch {
    return null
  }
})
