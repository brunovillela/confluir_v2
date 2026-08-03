import "server-only"

import { redirect } from "next/navigation"
import { cache } from "react"

import { createServiceClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"

/**
 * Camada de PLATAFORMA (acima dos tenants). O super-admin é o operador do
 * sistema — cria/edita organizações (tenants) e nomeia o admin de cada uma.
 * Identidade: registro em `plataforma_admins` ligado à conta do Supabase Auth.
 * NÃO é governado pelas permissões de tenant e acessa /admin fora do escopo
 * de qualquer organização. Ver [[confluir-multitenant]].
 */

export type SuperAdmin = {
  id: string
  authUserId: string
  nome: string | null
  email: string | null
}

/** Super-admin da requisição atual, ou null se o usuário logado não for um. */
export const getSuperAdmin = cache(async (): Promise<SuperAdmin | null> => {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const admin = createServiceClient()
  const { data } = await admin
    .from("plataforma_admins")
    .select("id, auth_user_id, nome, email")
    .eq("auth_user_id", user.id)
    .maybeSingle()
  if (!data) return null

  return {
    id: data.id as string,
    authUserId: data.auth_user_id as string,
    nome: (data.nome as string | null) ?? null,
    email: (data.email as string | null) ?? null,
  }
})

/** Exige super-admin; redireciona ao login preservando o destino. */
export async function requireSuperAdmin(): Promise<SuperAdmin> {
  const sa = await getSuperAdmin()
  if (!sa) redirect("/login?next=/admin")
  return sa
}
