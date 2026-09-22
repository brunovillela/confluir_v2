import { NextResponse, type NextRequest } from "next/server"

import { abrirSessaoPorLink, aptoDoToken } from "@/lib/acesso-eleitor"

/**
 * Destino do link pessoal do e-mail: /votar/<assembleia>/entrar?t=<token>.
 * Confere a assinatura, abre a sessão de voto daquele apto (cookie) e manda
 * para a cédula com o endereço limpo — o token não fica na barra do navegador
 * nem no histórico compartilhado.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const token = request.nextUrl.searchParams.get("t") ?? ""
  const destino = new URL(`/votar/${id}`, request.nextUrl.origin)

  const apto = token ? await aptoDoToken(token, id) : null
  if (!apto) {
    destino.searchParams.set("erro", "link")
    return NextResponse.redirect(destino)
  }
  await abrirSessaoPorLink(apto.id, id)
  return NextResponse.redirect(destino)
}
