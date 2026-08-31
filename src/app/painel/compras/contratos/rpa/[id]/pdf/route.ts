import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"

import { requirePermissao } from "@/lib/auth"
import { buscarRpa } from "@/lib/db/compras-rpa"
import { listarSedes, obterOrganizacao } from "@/lib/db/organizacao"
import { RpaPDF } from "@/lib/pdf/rpa"

export const runtime = "nodejs"

/** PDF do RPA — para baixar, colher a assinatura do prestador e arquivar. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermissao("aquisicoes_contratos", ["aquisicoes_contratos_edicao"])
  const { id } = await params

  const [rpa, organizacao, { sedes }] = await Promise.all([
    buscarRpa(id),
    obterOrganizacao(),
    listarSedes().catch(() => ({ disponivel: false, sedes: [] })),
  ])
  if (!rpa) return new Response("RPA não encontrado.", { status: 404 })

  const elemento = createElement(RpaPDF, {
    rpa,
    organizacao: {
      nome:
        organizacao?.nomeRazao ?? organizacao?.nomeFantasia ?? "Organização",
      cnpj: organizacao?.cnpjCpf ?? null,
      cidade: sedes[0]?.cidade ?? null,
    },
  }) as Parameters<typeof renderToBuffer>[0]
  const buffer = await renderToBuffer(elemento)

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="rpa-${rpa.numero ?? id.slice(0, 8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
