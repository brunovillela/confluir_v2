import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import type { NextRequest } from "next/server"

import { temVotoOnline } from "@/lib/assembleias-constantes"
import { requirePermissao } from "@/lib/auth"
import {
  dadosRelatorioApuracao,
  SECOES_DO_TIPO,
  SECOES_RELATORIO,
  TIPOS_RELATORIO,
  type SecaoRelatorio,
  type TipoRelatorio,
} from "@/lib/db/assembleias-relatorio"
import { logoDataUri } from "@/lib/db/oficios-assinatura"
import { obterOrganizacao, urlLogo } from "@/lib/db/organizacao"
import { RelatorioApuracaoPDF } from "@/lib/pdf/relatorio-apuracao"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * Relatórios da apuração de assembleia online:
 * `?tipo=votantes|resultado|completo` e, no completo, `&secao=<chave>` (várias).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  await requirePermissao("assembleias")
  const { id } = await params
  const busca = request.nextUrl.searchParams

  const tipoPedido = busca.get("tipo") ?? ""
  const tipo: TipoRelatorio = (TIPOS_RELATORIO as readonly string[]).includes(tipoPedido)
    ? (tipoPedido as TipoRelatorio)
    : "resultado"
  const validas = new Set<string>(SECOES_RELATORIO.map((x) => x.chave))
  const secoes: SecaoRelatorio[] =
    tipo === "completo"
      ? SECOES_RELATORIO.map((x) => x.chave).filter(
          (c) => validas.has(c) && busca.getAll("secao").includes(c)
        )
      : SECOES_DO_TIPO[tipo]
  if (secoes.length === 0) {
    return new Response("Escolha ao menos uma informação para o relatório.", { status: 400 })
  }

  const dados = await dadosRelatorioApuracao(id)
  if (!dados) return new Response("Não encontrado", { status: 404 })
  if (!temVotoOnline(dados.apuracao.modalidade)) {
    return new Response("Os relatórios são das votações online.", { status: 400 })
  }
  // A mesma régua da apuração: nada antes do término da assembleia.
  if (!dados.apuracao.apuracaoDisponivel) {
    return new Response("Os relatórios ficam disponíveis após o término da assembleia.", {
      status: 403,
    })
  }

  const org = await obterOrganizacao().catch(() => null)
  const logo = await logoDataUri(urlLogo(org?.logomarca ?? null))
  const elemento = createElement(RelatorioApuracaoPDF, {
    dados,
    tipo,
    secoes,
    entidade: org?.nomeFantasia ?? org?.nomeRazao ?? null,
    logoDataUri: logo,
  }) as Parameters<typeof renderToBuffer>[0]
  const pdf = await renderToBuffer(elemento)

  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="assembleia-${tipo}-${id.slice(0, 8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
