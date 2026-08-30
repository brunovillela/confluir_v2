import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"

import { obterOrganizacao } from "@/lib/db/organizacao"
import { dadosAta } from "@/lib/db/votacao-mesarios"
import { AtaPDF } from "@/lib/pdf/ata"

export const runtime = "nodejs"

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
  { params }: { params: Promise<{ id: string; eventoId: string }> }
) {
  const { id, eventoId } = await params
  const dados = await dadosAta(id, eventoId)
  if (!dados) return new Response("Não encontrado", { status: 404 })

  const org = await obterOrganizacao()
  const logo = await logoDataUri(org?.logoUrl ?? null)

  const elemento = createElement(AtaPDF, {
    dados,
    logoDataUri: logo,
  }) as Parameters<typeof renderToBuffer>[0]
  const buffer = await renderToBuffer(elemento)

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="ata-${dados.tipo}-${eventoId.slice(0, 8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
