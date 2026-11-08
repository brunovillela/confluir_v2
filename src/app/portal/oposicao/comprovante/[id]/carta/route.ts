import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"

import { requireSessaoTrabalhador } from "@/lib/auth"
import { obterComprovante, registrarAcessoDoTitular } from "@/lib/db/oposicao"
import { dadosDaCarta } from "@/lib/db/oposicao-assinatura"
import { CartaOposicaoPDF } from "@/lib/pdf/carta-oposicao"

export const runtime = "nodejs"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessao = await requireSessaoTrabalhador(`/portal/oposicao/comprovante/${(await params).id}`)
  const { id } = await params
  const c = await obterComprovante(id, sessao.cpf)
  if (!c) return new Response("Não encontrado", { status: 404 })
  await registrarAcessoDoTitular(c.id, "carta_baixada")
  // "Não quero me opor" não gera carta de oposição.
  if (c.situacao === "desistente") {
    return new Response(
      "Este registro é de quem optou por não se opor: não há carta de oposição.",
      { status: 404 }
    )
  }

  // Os mesmos dados da carta assinada pelo Confluir (o hash sai deles).
  const { dados, logo } = await dadosDaCarta(c)
  const elemento = createElement(CartaOposicaoPDF, {
    dados,
    logoDataUri: logo,
  }) as Parameters<typeof renderToBuffer>[0]
  const buffer = await renderToBuffer(elemento)

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="carta-oposicao-${id.slice(0, 8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
