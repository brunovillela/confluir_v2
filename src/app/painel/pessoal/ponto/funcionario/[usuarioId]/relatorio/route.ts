import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"

import { requirePermissao } from "@/lib/auth"
import { logoDataUri } from "@/lib/db/oficios-assinatura"
import { obterOrganizacao, urlLogo } from "@/lib/db/organizacao"
import { relatorioPontoFuncionario } from "@/lib/db/ponto-relatorio"
import { RelatorioPontoFuncionarioPDF } from "@/lib/pdf/relatorio-ponto-funcionario"

export const runtime = "nodejs"
export const maxDuration = 60

/** Relatório do ponto de um funcionário em PDF: anos lado a lado, alertas, mês a mês e isenções. */
export async function GET(_req: Request, { params }: { params: Promise<{ usuarioId: string }> }) {
  await requirePermissao("pessoal_gestao")
  const { usuarioId } = await params
  const [dados, org] = await Promise.all([relatorioPontoFuncionario(usuarioId), obterOrganizacao().catch(() => null)])
  if (!dados) return new Response("Funcionário não encontrado.", { status: 404 })
  const logo = await logoDataUri(urlLogo(org?.logomarca ?? null))
  const elemento = createElement(RelatorioPontoFuncionarioPDF, {
    dados,
    entidade: org?.nomeRazao ?? org?.nomeFantasia ?? "Organização",
    logoDataUri: logo,
  }) as Parameters<typeof renderToBuffer>[0]
  const pdf = await renderToBuffer(elemento)
  const nome = dados.funcionario.nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="relatorio-ponto-${nome}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
