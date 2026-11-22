import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"

import { requirePermissao } from "@/lib/auth"
import { obterCongresso } from "@/lib/db/congressos"
import { montarRelatorio } from "@/lib/db/congressos-relatorio"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { formatarDataHora } from "@/lib/formato"
import { RelatorioCongressoPDF } from "@/lib/pdf/relatorio-congresso"

/** Relatório final (interno: com as reservadas e os números do evento). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermissao("congressos_relatoria", ["congressos_gestao"])
  const { id } = await params
  const c = await obterCongresso(id)
  if (!c) return new Response("Congresso não encontrado.", { status: 404 })
  const [d, org] = await Promise.all([montarRelatorio(c, "relatorio"), obterOrganizacao().catch(() => null)])
  const buf = await renderToBuffer(
    createElement(RelatorioCongressoPDF, {
      d: { ...d, entidade: org?.nomeFantasia ?? org?.nomeRazao ?? null, geradoEm: formatarDataHora(new Date().toISOString()) },
    }) as Parameters<typeof renderToBuffer>[0]
  )
  return new Response(new Uint8Array(buf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="relatorio-final.pdf"` } })
}
