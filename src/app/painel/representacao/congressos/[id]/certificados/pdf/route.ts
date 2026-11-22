import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import QRCode from "qrcode"

import { requirePermissao } from "@/lib/auth"
import { obterCongresso } from "@/lib/db/congressos"
import { certificadosValidos } from "@/lib/db/congressos-encerramento"
import { periodoDoCongresso } from "@/lib/db/congressos-relatorio"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { formatarData } from "@/lib/formato"
import { logoDataUri } from "@/lib/pdf/logo-pdf"
import { CertificadosPDF } from "@/lib/pdf/certificado-congresso"
import { origemAtual } from "@/lib/tenant-url"

/** Todos os certificados válidos em um PDF (um por página). `?p=<participanteId>` gera só o de uma pessoa. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  await requirePermissao("congressos_gestao")
  const { id } = await params
  const c = await obterCongresso(id)
  if (!c) return new Response("Congresso não encontrado.", { status: 404 })
  const participante = new URL(req.url).searchParams.get("p") ?? undefined
  const [certs, org, origem] = await Promise.all([certificadosValidos(c, undefined, participante), obterOrganizacao().catch(() => null), origemAtual()])
  if (!certs.length) return new Response("Nenhum certificado emitido.", { status: 404 })
  const buf = await renderToBuffer(
    createElement(CertificadosPDF, {
      d: {
        entidade: org?.nomeFantasia ?? org?.nomeRazao ?? null,
        logo: await logoDataUri(org?.logoUrl ?? null),
        congresso: `${c.edicao ? `${c.edicao}º ` : ""}${c.nome}`,
        periodo: periodoDoCongresso(c),
        local: c.local,
        emitidoEm: formatarData(new Date().toISOString()),
        certificados: await Promise.all(
          certs.map(async (x) => {
            const url = `${origem}/verificar/${x.codigo}`
            return { nome: x.nome, condicao: x.condicao, frequencia: x.frequencia, codigo: x.codigo, verificarUrl: url, qrDataUri: await QRCode.toDataURL(url, { margin: 1, width: 200 }) }
          })
        ),
      },
    }) as Parameters<typeof renderToBuffer>[0]
  )
  return new Response(new Uint8Array(buf), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="certificados.pdf"` } })
}
