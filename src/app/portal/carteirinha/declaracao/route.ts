import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import QRCode from "qrcode"

import { getSessaoPortal } from "@/lib/auth"
import { dadosCarteirinha } from "@/lib/db/carteirinha"
import { hojeSP } from "@/lib/db/comum"
import { logoDataUri } from "@/lib/db/oficios-assinatura"
import { listarSedes, obterOrganizacao, urlLogo } from "@/lib/db/organizacao"
import { DeclaracaoFiliacaoPDF } from "@/lib/pdf/declaracao-filiacao"
import { formatarCnpjCpf } from "@/lib/formato"

export const runtime = "nodejs"
export const maxDuration = 30

/** Declaração de filiação em PDF, emitida pelo próprio filiado (F1). */
export async function GET(): Promise<Response> {
  const sessao = await getSessaoPortal()
  if (!sessao) return new Response("Entre no portal para emitir a declaração.", { status: 401 })
  const dados = await dadosCarteirinha(sessao.filiado.cpf)
  if (!dados) return new Response("Cadastro não encontrado.", { status: 404 })
  const [org, sedes] = await Promise.all([obterOrganizacao().catch(() => null), listarSedes().catch(() => ({ disponivel: false, sedes: [] }))])
  const cidade = sedes.sedes.find((x) => x.cidade)?.cidade ?? null
  const [logo, qr] = await Promise.all([
    logoDataUri(urlLogo(org?.logomarca ?? null)),
    dados.urlVerificacao ? QRCode.toDataURL(dados.urlVerificacao, { errorCorrectionLevel: "M", margin: 1, width: 256 }) : Promise.resolve(null),
  ])
  const elemento = createElement(DeclaracaoFiliacaoPDF, {
    dados,
    org: { nomeRazao: org?.nomeRazao ?? org?.nomeFantasia ?? null, cnpjCpf: org?.cnpjCpf ? formatarCnpjCpf(org.cnpjCpf) : null, cidade, logoDataUri: logo },
    qrDataUri: qr,
    emitidaEm: hojeSP(),
  }) as Parameters<typeof renderToBuffer>[0]
  const pdf = await renderToBuffer(elemento)
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="declaracao-filiacao.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
