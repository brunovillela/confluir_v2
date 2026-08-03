import { cookies } from "next/headers"
import { createServerClient } from "@supabase/ssr"

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env"

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch {
          // Chamado a partir de um Server Component — os cookies são
          // atualizados pelo proxy, então é seguro ignorar.
        }
      },
    },
  })
}
