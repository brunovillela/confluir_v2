import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"

import { requirePermissao } from "@/lib/auth"
import { obterOrganizacao, listarSedes } from "@/lib/db/organizacao"
import { dadosOrdemServico } from "@/lib/db/pessoal-sst"
import { SstDocumentoPDF } from "@/lib/pdf/sst-documento"

export const runtime = "nodejs"

/** Ordem de Serviço (NR-01) de um funcionário — PDF para baixar e assinar. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ funcionarioId: string }> }
) {
  await requirePermissao("pessoal_gestao")
  const { funcionarioId } = await params

  const [dados, organizacao, { sedes }] = await Promise.all([
    dadosOrdemServico(funcionarioId),
    obterOrganizacao(),
    listarSedes().catch(() => ({ disponivel: false, sedes: [] })),
  ])
  if (!dados) {
    return new Response("Funcionário sem tarefas atribuídas.", { status: 404 })
  }

  const elemento = createElement(SstDocumentoPDF, {
    dados,
    organizacao: {
      nome:
        organizacao?.nomeRazao ?? organizacao?.nomeFantasia ?? "Organização",
      cnpj: organizacao?.cnpjCpf ?? null,
      cidade: sedes[0]?.cidade ?? null,
    },
  }) as Parameters<typeof renderToBuffer>[0]
  const buffer = await renderToBuffer(elemento)

  const nome = (dados.pessoa.nome ?? funcionarioId.slice(0, 8))
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ordem-de-servico-${nome}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
