import { NextResponse, type NextRequest } from "next/server"

import { linkPorId, registrarClique } from "@/lib/db/comunicacao-links"

/**
 * Redirecionamento com contagem dos cliques da página pública de links
 * (/links). SEM login — tenant pelo host. Link inativo/inexistente volta para
 * a própria página.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params
  const link = /^[0-9a-f-]{36}$/i.test(id) ? await linkPorId(id) : null

  if (!link || !link.ativo || !link.url) {
    return NextResponse.redirect(new URL("/links", req.nextUrl.origin))
  }

  await registrarClique(id, link.cliques)
  return NextResponse.redirect(link.url)
}
