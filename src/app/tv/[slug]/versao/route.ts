import { NextRequest, NextResponse } from "next/server"

import { exibicaoDoLink } from "@/lib/db/comunicacao-slides"

/**
 * Versão do que a TV deve mostrar — a tela confere a cada minuto e recarrega
 * quando muda. SEM login (tenant pelo host). Cada consulta sem ?previa=1
 * registra a última conexão da TV, mostrada no painel.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params
  const previa = req.nextUrl.searchParams.get("previa") === "1"
  const { versao } = await exibicaoDoLink(slug, { registrarAcesso: !previa })
  return NextResponse.json(
    { versao },
    { headers: { "Cache-Control": "no-store" } }
  )
}
