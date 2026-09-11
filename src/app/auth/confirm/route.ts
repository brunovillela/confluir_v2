import { NextResponse, type NextRequest } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"

import {
  diagnosticarLinkRecusado,
  registrarLinkAceito,
} from "@/lib/auth-diagnostico"
import type { MotivoRecusaLink } from "@/lib/auth-email-constantes"
import { createClient } from "@/lib/supabase/server"

/**
 * Destino dos links de email (convite, magic link, recuperação de senha).
 * Suporta os dois formatos do Supabase:
 *  - token_hash + type → verifyOtp (templates customizados, recomendado)
 *  - code             → exchangeCodeForSession (fluxo PKCE padrão)
 *
 * Link recusado: o motivo real (expirado, já usado, outro navegador, limite)
 * vai para o log e para a tela, via ?erro=link_<motivo>. Ver
 * src/lib/auth-diagnostico.ts.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null
  const code = searchParams.get("code")
  const erroNaUrl = searchParams.get("error_code")
  const next = searchParams.get("next") ?? "/painel"
  const userAgent = request.headers.get("user-agent")

  // Só permite redirecionos internos.
  const destino = next.startsWith("/") ? next : "/painel"
  // Filiado volta ao portal; os demais, à tela de login do painel.
  const telaDeErro = destino.startsWith("/portal") ? "/portal" : "/login"

  const supabase = await createClient()
  let motivo: MotivoRecusaLink

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    })
    if (!error) {
      registrarLinkAceito(type, userAgent)
      return NextResponse.redirect(new URL(destino, request.url))
    }
    motivo = await diagnosticarLinkRecusado({
      erro: error,
      fluxo: "token_hash",
      tipo: type,
      tokenHash,
      userAgent,
    })
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      registrarLinkAceito("code", userAgent)
      return NextResponse.redirect(new URL(destino, request.url))
    }
    motivo = await diagnosticarLinkRecusado({
      erro: error,
      fluxo: "code",
      userAgent,
    })
  } else if (erroNaUrl) {
    // O próprio Supabase recusou antes de redirecionar e mandou o erro na URL.
    motivo = await diagnosticarLinkRecusado({
      erro: { code: erroNaUrl, message: searchParams.get("error_description") ?? undefined },
      fluxo: "erro_na_url",
      userAgent,
    })
  } else {
    motivo = "invalido"
  }

  return NextResponse.redirect(
    new URL(`${telaDeErro}?erro=link_${motivo}`, request.url)
  )
}
