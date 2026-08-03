import { NextResponse, type NextRequest } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"

import { createClient } from "@/lib/supabase/server"

/**
 * Destino dos links de email (convite, magic link, recuperação de senha).
 * Suporta os dois formatos do Supabase:
 *  - token_hash + type → verifyOtp (templates customizados, recomendado)
 *  - code             → exchangeCodeForSession (fluxo PKCE padrão)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const code = searchParams.get("code")
  const next = searchParams.get("next") ?? "/painel"

  // Só permite redirecionos internos.
  const destino = next.startsWith("/") ? next : "/painel"

  const supabase = await createClient()

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    })
    if (!error) {
      return NextResponse.redirect(new URL(destino, request.url))
    }
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(destino, request.url))
    }
  }

  return NextResponse.redirect(
    new URL("/login?erro=link_invalido", request.url)
  )
}
