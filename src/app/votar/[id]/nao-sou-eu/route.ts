import { NextResponse, type NextRequest } from "next/server"

import { aptoDoToken, encerrarSessaoPorLink } from "@/lib/acesso-eleitor"
import { marcarEmailNaoReconhecido } from "@/lib/db/votacao-primeiro-acesso"

/**
 * "Não sou eu", do e-mail de aviso: quem recebeu o link num endereço que não é
 * dele avisa o sindicato. O apto fica marcado para a secretaria conferir e o
 * link para de abrir a cédula — é a saída de quem teve o e-mail cadastrado
 * errado pela empregadora.
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
  await marcarEmailNaoReconhecido(apto.id)
  await encerrarSessaoPorLink()
  destino.searchParams.set("aviso", "nao-sou-eu")
  return NextResponse.redirect(destino)
}
