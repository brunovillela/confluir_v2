import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"

import { requireSessaoTrabalhador } from "@/lib/auth"
import { obterComprovante } from "@/lib/db/oposicao"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { CartaOposicaoPDF } from "@/lib/pdf/carta-oposicao"

import { logoDataUri } from "@/lib/pdf/logo-pdf"

export const runtime = "nodejs"

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessao = await requireSessaoTrabalhador()
  const { id } = await params
  const c = await obterComprovante(id, sessao.cpf)
  if (!c) return new Response("Não encontrado", { status: 404 })
  // "Não quero me opor" não gera carta de oposição.
  if (c.situacao === "desistente") {
    return new Response(
      "Este registro é de quem optou por não se opor: não há carta de oposição.",
      { status: 404 }
    )
  }

  const org = await obterOrganizacao()
  const logo = await logoDataUri(org?.logoUrl ?? null)

  const elemento = createElement(CartaOposicaoPDF, {
    dados: {
      organizacao: org?.nomeFantasia ?? org?.nomeRazao ?? null,
      nome: c.nome,
      cpf: c.cpf,
      matricula: c.matricula,
      empregador: c.empregadorNome,
      campanha: c.campanhaNome,
      detalhe: c.detalhe_desconto,
      declaracao: c.texto_declaracao,
      protocolo: c.protocolo,
      data: c.confirmado_em,
    },
    logoDataUri: logo,
  }) as Parameters<typeof renderToBuffer>[0]
  const buffer = await renderToBuffer(elemento)

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="carta-oposicao-${id.slice(0, 8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
