import { NextResponse, type NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { marcarLida } from "@/lib/db/notificacoes"

/** Abre uma notificação: marca como lida e redireciona ao destino dela. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessao = await getSessaoPainel()
  if (!sessao) {
    return NextResponse.redirect(new URL("/login", request.url))
  }

  const { id } = await params
  const href = await marcarLida(id, sessao.usuario.id)
  const destino = href && href.startsWith("/") ? href : "/painel/notificacoes"
  return NextResponse.redirect(new URL(destino, request.url))
}
