import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"

import { getSessaoPainel } from "@/lib/auth"
import { podeAcessar } from "@/lib/permissoes"
import { obterSolicitacao } from "@/lib/db/espacos-esteira"
import { termoDaCessao } from "@/lib/db/espacos-termo"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { TermoCessaoPDF } from "@/lib/pdf/termo-cessao"

export const runtime = "nodejs"

/** Logo (png/jpg) como data URI; ignora SVG e falhas de rede. */
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
  ctx: { params: Promise<{ id: string }> }
) {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "espacos", ["espacos_gestao"])) {
    return new Response("Sem acesso", { status: 403 })
  }
  const { id } = await ctx.params

  const [termo, pedido, org] = await Promise.all([
    termoDaCessao(id),
    obterSolicitacao(id),
    obterOrganizacao(),
  ])
  if (!termo.texto || !pedido) {
    return new Response("Termo ainda não gerado", { status: 404 })
  }

  const elemento = createElement(TermoCessaoPDF, {
    texto: termo.texto,
    entidade: org?.nomeRazao ?? org?.nomeFantasia ?? null,
    subtitulo: org?.cnpjCpf ? `CNPJ ${org.cnpjCpf}` : null,
    codigo: termo.codigo,
    numero: pedido.numero,
    logo: await logoDataUri(org?.logoUrl ?? null),
  }) as Parameters<typeof renderToBuffer>[0]
  const pdf = await renderToBuffer(elemento)

  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="termo-cessao-${pedido.numero ?? id}.pdf"`,
    },
  })
}
