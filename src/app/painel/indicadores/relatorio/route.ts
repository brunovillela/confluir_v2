import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { logoDataUri } from "@/lib/db/oficios-assinatura"
import { obterOrganizacao, urlLogo } from "@/lib/db/organizacao"
import { montarRelatorio } from "@/lib/db/relatorio-diretoria"
import { RelatorioDiretoriaPDF } from "@/lib/pdf/relatorio-diretoria"
import { podeAcessar } from "@/lib/permissoes"

export const runtime = "nodejs"
export const maxDuration = 60

/** Relatório da diretoria em PDF (D5): `?mes=AAAA-MM` (padrão: o mês anterior). */
export async function GET(request: NextRequest): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (
    !sessao ||
    !podeAcessar(sessao.permissoes, "configuracoes", ["financeiro_leitura", "financeiro_pagamento", "filiacao_gestao", "filiacao_receitas", "diretoria_mandatos"])
  ) {
    return new Response("Sem acesso", { status: 403 })
  }
  const hoje = hojeSP()
  const [a, m] = hoje.split("-").map(Number)
  const padrao = new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7)
  const pedido = request.nextUrl.searchParams.get("mes") ?? padrao
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) && pedido <= hoje.slice(0, 7) ? pedido : padrao

  const [dados, org] = await Promise.all([montarRelatorio(sessao, mes), obterOrganizacao().catch(() => null)])
  const logo = await logoDataUri(urlLogo(org?.logomarca ?? null))
  const elemento = createElement(RelatorioDiretoriaPDF, { dados, logoDataUri: logo }) as Parameters<typeof renderToBuffer>[0]
  const pdf = await renderToBuffer(elemento)
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="relatorio-diretoria-${mes}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
