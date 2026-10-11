import { createElement } from "react"
import { NextResponse, type NextRequest } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"

import { rotuloTipoContribuicao } from "@/lib/contribuicao-situacao"
import { extratoAnual } from "@/lib/db/carteirinha"
import { hojeSP } from "@/lib/db/comum"
import { cadastroDoFiliado } from "@/lib/db/filiado-portal"
import { logoDataUri } from "@/lib/db/oficios-assinatura"
import { listarSedes, obterOrganizacao, urlLogo } from "@/lib/db/organizacao"
import { cpfConfiavel } from "@/lib/cpf"
import { formatarCnpjCpf } from "@/lib/formato"
import { ExtratoContribuicaoPDF } from "@/lib/pdf/extrato-contribuicao"
import { origemAtual } from "@/lib/tenant-url"
import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"

export const runtime = "nodejs"
export const maxDuration = 30

/** Só os seis dígitos do meio, como na carteirinha. */
function cpfMascarado(cpf: string | null): string {
  if (!cpf || cpf.length !== 11) return "—"
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`
}

/**
 * Extrato anual de contribuições em PDF (A61): `?ano=AAAA` (sem ele, o ano
 * corrente).
 *
 * Mesma régua da declaração de filiação: só sai para o filiado da sessão do
 * portal, com os dados dele — nada na URL escolhe de quem é o extrato. Na
 * visualização pela gestão ("Ver como filiado") não emite: volta à página com
 * o aviso. Os desvios voltam sempre a uma página do portal (o botão abre em
 * aba nova), pela origem da requisição, para cair no subdomínio da entidade.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const [vis, origem] = await Promise.all([getVisualizacaoPortal(), origemAtual()])
  if (!vis) return NextResponse.redirect(`${origem}/portal`)

  const anoAtual = Number(hojeSP().slice(0, 4))
  const pedido = request.nextUrl.searchParams.get("ano") ?? ""
  const ano = /^\d{4}$/.test(pedido) && Number(pedido) >= 1990 && Number(pedido) <= anoAtual ? Number(pedido) : anoAtual
  const pagina = `${origem}/portal/contribuicao?ano=${ano}`

  if (vis.preview) return NextResponse.redirect(`${pagina}&aviso=visualizacao`)
  try {
    const cadastro = await cadastroDoFiliado(vis.filiado.cpf)
    // A página explica a falha ("não foi possível carregar…").
    if (!cadastro) return NextResponse.redirect(`${origem}/portal/contribuicao`)
    const [extrato, org, sedes] = await Promise.all([
      extratoAnual(cadastro.id, ano),
      obterOrganizacao().catch(() => null),
      listarSedes().catch(() => ({ disponivel: false, sedes: [] })),
    ])
    const logo = await logoDataUri(urlLogo(org?.logomarca ?? null))
    const elemento = createElement(ExtratoContribuicaoPDF, {
      org: {
        nome: org?.nomeRazao ?? org?.nomeFantasia ?? "Entidade",
        cnpjCpf: org?.cnpjCpf ? formatarCnpjCpf(org.cnpjCpf) : null,
        cidade: sedes.sedes.find((x) => x.cidade)?.cidade ?? null,
        logoDataUri: logo,
      },
      pessoa: {
        nome: cadastro.nome_completo ?? "(sem nome)",
        cpfMascarado: cpfMascarado(cpfConfiavel(cadastro.cpf)),
        matricula: cadastro.matricula_sindical,
      },
      ano,
      linhas: extrato.linhas.map((l) => ({
        mes: l.competencia,
        tipo: rotuloTipoContribuicao(l.tipo),
        fonte: l.fonte ?? (l.direta === "pix" ? "Pix (pagamento direto)" : l.direta === "boleto" ? "Boleto (pagamento direto)" : "—"),
        valor: l.valor,
      })),
      porTipo: extrato.porTipo.map((t) => ({ tipo: rotuloTipoContribuicao(t.tipo), valor: t.valor })),
      total: extrato.total,
      emitidoEm: hojeSP(),
    }) as Parameters<typeof renderToBuffer>[0]
    const pdf = await renderToBuffer(elemento)
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="contribuicoes-${ano}.pdf"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (e) {
    console.error("extrato de contribuições:", e instanceof Error ? e.message : e)
    return NextResponse.redirect(`${pagina}&aviso=extrato`)
  }
}
