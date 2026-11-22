import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import QRCode from "qrcode"

import { obterCongresso } from "@/lib/db/congressos"
import { certificadoPeloLink } from "@/lib/db/congressos-encerramento"
import { participantePeloLink } from "@/lib/db/congressos-mocoes"
import { periodoDoCongresso } from "@/lib/db/congressos-relatorio"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { formatarData } from "@/lib/formato"
import { logoDataUri } from "@/lib/pdf/logo-pdf"
import { CertificadosPDF } from "@/lib/pdf/certificado-congresso"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/** O certificado da própria pessoa, pelo link pessoal (emite na hora se já tem direito). */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const tenantId = await tenantAtual()
  const p = await participantePeloLink(token, tenantId)
  if (!p) return new Response("Link inválido.", { status: 404 })
  const c = await obterCongresso(p.congressoId)
  if (!c) return new Response("Congresso não encontrado.", { status: 404 })
  const r = await certificadoPeloLink(c, tenantId, p.id)
  if (!r.certificado) return new Response(r.motivo ?? "Certificado indisponível.", { status: 403, headers: { "content-type": "text/plain; charset=utf-8" } })
  const [org, origem] = await Promise.all([obterOrganizacao().catch(() => null), origemAtual()])
  const url = `${origem}/verificar/${r.certificado.codigo}`
  const buf = await renderToBuffer(
    createElement(CertificadosPDF, {
      d: {
        entidade: org?.nomeFantasia ?? org?.nomeRazao ?? null,
        logo: await logoDataUri(org?.logoUrl ?? null),
        congresso: `${c.edicao ? `${c.edicao}º ` : ""}${c.nome}`,
        periodo: periodoDoCongresso(c),
        local: c.local,
        emitidoEm: formatarData(r.certificado.emitidoEm),
        certificados: [
          { ...r.certificado, verificarUrl: url, qrDataUri: await QRCode.toDataURL(url, { margin: 1, width: 200 }) },
        ],
      },
    }) as Parameters<typeof renderToBuffer>[0]
  )
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="certificado.pdf"`, "referrer-policy": "no-referrer", "cache-control": "private, no-store" },
  })
}
