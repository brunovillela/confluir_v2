import { createElement } from "react"
import { NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"
import QRCode from "qrcode"

import { dadosCarteirinha } from "@/lib/db/carteirinha"
import { hojeSP } from "@/lib/db/comum"
import { logoDataUri } from "@/lib/db/oficios-assinatura"
import { listarSedes, obterOrganizacao, urlLogo } from "@/lib/db/organizacao"
import { bloqueioDaParte, opcoesDaParte } from "@/lib/db/portal-partes"
import { DeclaracaoFiliacaoPDF } from "@/lib/pdf/declaracao-filiacao"
import { formatarCnpjCpf } from "@/lib/formato"
import { origemAtual } from "@/lib/tenant-url"
import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"

export const runtime = "nodejs"
export const maxDuration = 30

/**
 * Declaração de filiação em PDF, emitida pelo próprio filiado (F1).
 *
 * Só sai para o filiado da sessão do portal. Na visualização pela gestão
 * ("Ver como filiado") não emite nada: a declaração é ato do próprio
 * associado (antes, com getSessaoPortal, o atendente que também é filiado
 * recebia a DELE dentro da tela de outra pessoa). Se a entidade quiser que
 * o atendimento emita a do visualizado, é este ramo que muda — e o botão
 * em carteirinha/page.tsx.
 *
 * Os desvios voltam a uma página do portal (o botão abre em aba nova),
 * nunca a uma frase solta. A origem vem da requisição (origemAtual, pelo
 * cabeçalho host), para cair no subdomínio da entidade — `request.url`,
 * fora da Vercel, sai com o hostname do servidor.
 *
 * Área do associado: não emite com a Carteirinha suspensa ou desabilitada,
 * com o portal em modo de consulta ou fora do ar (bloqueioDaParte), nem com a
 * declaração desligada — volta à carteirinha com ?aviso=declaracao, que diz o
 * motivo (a parte desabilitada mostra "indisponível" no lugar). O botão abre
 * em aba nova e o link pode estar guardado: a trava tem de estar aqui. Sem o
 * vínculo (mostrar_fontes desligado), a declaração sai sem as fontes.
 */
export async function GET(): Promise<Response> {
  const [vis, origem] = await Promise.all([getVisualizacaoPortal(), origemAtual()])
  if (!vis) return NextResponse.redirect(`${origem}/portal`)
  if (vis.preview) return NextResponse.redirect(`${origem}/portal/carteirinha?aviso=visualizacao`)
  const [bloqueio, opcoes] = await Promise.all([bloqueioDaParte("carteirinha"), opcoesDaParte("carteirinha")])
  if (bloqueio || !opcoes.declaracao_pdf) return NextResponse.redirect(`${origem}/portal/carteirinha?aviso=declaracao`)
  const lidos = await dadosCarteirinha(vis.filiado.cpf)
  // A carteirinha explica a falha ("fale com o sindicato").
  if (!lidos) return NextResponse.redirect(`${origem}/portal/carteirinha`)
  const dados = opcoes.mostrar_fontes ? lidos : { ...lidos, fontes: [] }
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
