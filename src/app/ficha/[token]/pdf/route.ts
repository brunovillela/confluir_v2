import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"

import {
  obterSolicitacaoPorToken,
  obterTextosDosTermos,
} from "@/lib/db/filiacao-publica"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { FichaFiliacaoPDF, type OrgPdf } from "@/lib/pdf/ficha-filiacao"

export const runtime = "nodejs"

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params
  if (!UUID.test(token)) {
    return new Response("Não encontrado", { status: 404 })
  }

  const dados = await obterSolicitacaoPorToken(token)
  if (!dados) return new Response("Não encontrado", { status: 404 })

  const [organizacao, termos] = await Promise.all([
    obterOrganizacao(),
    obterTextosDosTermos(dados.tlLgpdId, dados.tlDescontoId),
  ])
  const org: OrgPdf = {
    nomeRazao: organizacao?.nomeRazao ?? null,
    nomeFantasia: organizacao?.nomeFantasia ?? null,
    cnpjCpf: organizacao?.cnpjCpf ?? null,
    logoDataUri: await logoDataUri(organizacao?.logoUrl ?? null),
  }

  // O componente retorna um <Document>; renderToBuffer tipa a raiz como Document.
  const elemento = createElement(FichaFiliacaoPDF, {
    dados,
    org,
    termos,
  }) as Parameters<typeof renderToBuffer>[0]
  const buffer = await renderToBuffer(elemento)

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="ficha-filiacao-${token.slice(0, 8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
