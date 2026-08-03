import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"

import { requirePermissao } from "@/lib/auth"
import { dadosImpressao } from "@/lib/db/oficios"
import { OficioPDF } from "@/lib/pdf/oficio"

export const runtime = "nodejs"

/** Baixa o logo (png/jpg) como data URI; ignora SVG e falhas de rede. */
async function logoDataUri(url: string | null): Promise<string | null> {
  if (!url) return null
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const tipo = r.headers.get("content-type") ?? ""
    if (!/image\/(png|jpe?g)/.test(tipo)) return null
    const buf = Buffer.from(await r.arrayBuffer())
    return `data:${tipo};base64,${buf.toString("base64")}`
  } catch {
    return null
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermissao("ferramentas_oficios")
  const { id } = await params

  const dados = await dadosImpressao(id)
  if (!dados) return new Response("Não encontrado", { status: 404 })

  const logo = await logoDataUri(dados.organizacao.logoUrl)
  const elemento = createElement(OficioPDF, {
    dados,
    logoDataUri: logo,
  }) as Parameters<typeof renderToBuffer>[0]
  const buffer = await renderToBuffer(elemento)

  const numero =
    dados.oficio.numero != null
      ? `${dados.oficio.numero}-${dados.oficio.ano}`
      : id.slice(0, 8)
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="oficio-${numero}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
