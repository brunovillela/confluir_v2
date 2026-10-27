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

  // Só permite redirecionamentos internos: um caminho que começa com UMA
  // barra. `//evil.com` e `/\evil.com` começam com barra, mas `new URL()` os
  // resolve como outro host (open redirect — achado S8 da avaliação de 03/10).
  const destino = /^\/(?![/\\])/.test(next) ? next : "/painel"
  // Oposição volta à entrada dela (o trabalhador não filiado não tem portal);
  // filiado volta ao portal; os demais, à tela de login do painel (A3).
  const telaDeErro = destino.startsWith("/portal/oposicao")
    ? "/portal/oposicao"
    : destino.startsWith("/portal")
      ? "/portal"
      : "/login"

  const supabase = await createClient()
  let motivo: MotivoRecusaLink

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    })
    if (!error) {
      registrarLinkAceito(type, userAgent)
      return await seguirComVinculo(supabase, destino, telaDeErro, request)
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
      return await seguirComVinculo(supabase, destino, telaDeErro, request)
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

/**
 * Link aceito: se havia um vínculo pendente (link mágico do portal: e-mail do
 * cadastro ↔ CPF), ele vira a identidade da conta agora. Conta já vinculada a
 * outro CPF volta à tela de entrada com o motivo, em vez de cair numa sessão
 * sem identidade. Ver lib/auth-identidade.ts. Filiado a caminho do portal
 * passa antes pelo primeiro acesso, quando ele está pendente.
 */
async function seguirComVinculo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  destino: string,
  telaDeErro: string,
  request: NextRequest
) {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  let final = destino
  if (user) {
    const { consumirVinculoPendente } = await import("@/lib/auth-identidade")
    const vinculo = await consumirVinculoPendente({ userId: user.id, emailVerificado: user.email })
    if (vinculo.erro) {
      await supabase.auth.signOut()
      return NextResponse.redirect(new URL(`${telaDeErro}?erro=vinculo_cpf`, request.url))
    }
    // Só o ramo do portal: o filiado com o primeiro acesso pendente passa por
    // ele antes, levando o destino junto (painel e hotel seguem como sempre).
    if (vinculo.identidade?.tipo === "filiado") {
      final = await destinoDoFiliado(vinculo.identidade.cpf, destino)
    }
  }
  return NextResponse.redirect(new URL(final, request.url))
}

/**
 * Destino do portal (/portal/…) de um filiado ativo, pelo primeiro acesso
 * (destinoAoEntrar). Qualquer outro destino, ou falha na leitura, segue
 * como veio: na dúvida, não trava.
 */
async function destinoDoFiliado(cpf: string, destino: string): Promise<string> {
  const { destinoDoPortal } = await import("@/lib/portal-destino")
  const doPortal = destinoDoPortal(destino)
  if (!doPortal) return destino
  try {
    const [{ buscarFiliadoPorCpf }, { destinoAoEntrar }] = await Promise.all([
      import("@/lib/contas"),
      import("@/lib/db/portal-primeiro-acesso"),
    ])
    const filiado = await buscarFiliadoPorCpf(cpf)
    return filiado?.ativo ? await destinoAoEntrar(filiado, doPortal) : destino
  } catch {
    return destino
  }
}
