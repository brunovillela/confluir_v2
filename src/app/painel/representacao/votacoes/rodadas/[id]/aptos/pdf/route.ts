import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import type { NextRequest } from "next/server"

import { logoDataUri } from "@/lib/db/oficios-assinatura"
import { obterOrganizacao, urlLogo } from "@/lib/db/organizacao"
import { RelacaoAptosPDF } from "@/lib/pdf/relacao-aptos"

import { lerExtracaoAptos } from "../extracao"

export const runtime = "nodejs"
// Rodada grande (milhares de aptos, dezenas de páginas): como a relação de votantes.
export const maxDuration = 300

/** Relação dos aptos da rodada em PDF, com os filtros da aba Aptos (09/11/2026). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params
  const r = await lerExtracaoAptos(request, id, "pdf")
  if (r instanceof Response) return r
  const org = await obterOrganizacao().catch(() => null)
  const logo = await logoDataUri(urlLogo(org?.logomarca ?? null))
  const votaram = r.linhas.filter((a) => a.hora_voto).length
  const elemento = createElement(RelacaoAptosPDF, {
    entidade: org?.nomeFantasia ?? org?.nomeRazao ?? null,
    logoDataUri: logo,
    campanha: r.campanha,
    rodada: r.rodada,
    fonte: r.fonte,
    filtro: r.filtro,
    totais: { listados: r.linhas.length, votaram, naoVotaram: r.linhas.length - votaram },
    linhas: r.linhas.map((a) => ({
      nome: a.nome_completo,
      cpf: a.cpf,
      matricula: a.matricula,
      votouEm: a.hora_voto,
      canal: a.canal,
    })),
  }) as Parameters<typeof renderToBuffer>[0]
  const pdf = await renderToBuffer(elemento)
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="aptos-${r.codigo}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
