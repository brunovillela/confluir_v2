import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import type { NextRequest } from "next/server"

import { obterCampanhaPublica } from "@/lib/db/oposicao"
import { cartaDaCampanha, cartaDaEntidade } from "@/lib/db/oposicao-carta"
import { requireOposicao } from "@/lib/db/oposicao-regras"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { DECLARACAO_PADRAO } from "@/lib/oposicao-constantes"
import { CARTA_PADRAO, valoresDeExemplo } from "@/lib/oposicao-carta"
import { CartaOposicaoPDF } from "@/lib/pdf/carta-oposicao"
import { logoDataUri } from "@/lib/pdf/logo-pdf"

export const runtime = "nodejs"

/**
 * A carta de oposição em PDF com dados de exemplo (14/11/2026): o texto SALVO
 * da entidade ou, com ?campanha=, o que vale na campanha. É o mesmo
 * componente da carta real; só os dados da pessoa são fictícios.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const campanhaId = request.nextUrl.searchParams.get("campanha")
  await requireOposicao("consultar", campanhaId)
  const [org, campanha, carta] = await Promise.all([
    obterOrganizacao().catch(() => null),
    campanhaId ? obterCampanhaPublica(campanhaId) : Promise.resolve(null),
    campanhaId ? cartaDaCampanha(campanhaId) : cartaDaEntidade().then((e) => ({ vigente: e.modelo ?? CARTA_PADRAO })),
  ])
  if (campanhaId && (!campanha || !carta)) return new Response("Campanha não encontrada", { status: 404 })
  const ex = valoresDeExemplo()
  const elemento = createElement(CartaOposicaoPDF, {
    dados: {
      organizacao: org?.nomeFantasia ?? org?.nomeRazao ?? null,
      nome: ex.NOME_COMPLETO ?? null,
      cpf: "12345678909",
      matricula: ex.MATRICULA ?? null,
      empregador: ex.EMPRESA ?? null,
      empregadorCnpj: ex.CNPJ_EMPRESA ?? null,
      campanha: campanha ? campanha.nome : (ex.CAMPANHA ?? null),
      detalhe: campanha ? campanha.detalhe_desconto : (ex.DETALHE_DESCONTO ?? null),
      declaracao: campanha?.texto_declaracao ?? DECLARACAO_PADRAO,
      protocolo: 1234,
      data: new Date().toISOString(),
      modelo: carta?.vigente ?? CARTA_PADRAO,
    },
    logoDataUri: await logoDataUri(org?.logoUrl ?? null),
  }) as Parameters<typeof renderToBuffer>[0]
  const pdf = await renderToBuffer(elemento)
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="carta-oposicao-exemplo.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
