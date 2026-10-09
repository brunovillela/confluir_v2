import { requirePermissao } from "@/lib/auth"
import { buscarRpa } from "@/lib/db/compras-rpa"
import { renderizarPdfRpa } from "@/lib/db/rpa-assinatura"

export const runtime = "nodejs"

/** PDF do RPA — para baixar, colher a assinatura do prestador e arquivar. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Quem opera compras também baixa o recibo (o de compra de serviço é dele).
  await requirePermissao("aquisicoes_contratos", [
    "aquisicoes_contratos_edicao",
    "aquisicoes_compras_edicao",
    "aquisicoes_comprador",
    "aquisicoes_compra_direta",
  ])
  const { id } = await params

  const rpa = await buscarRpa(id)
  if (!rpa) return new Response("RPA não encontrado.", { status: 404 })
  const buffer = await renderizarPdfRpa(rpa)

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="rpa-${rpa.numero ?? id.slice(0, 8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
