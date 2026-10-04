import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { listarProcessos, type ProcessoLinha } from "@/lib/db/compras"
import { escopoComprasDoUsuario } from "@/lib/db/compras-acesso"
import { SITUACOES_PROCESSO, type SituacaoProcesso } from "@/lib/compras-constantes"
import { podeAcessar } from "@/lib/permissoes"
import { dataXlsx, planilhaXlsx, respostaXlsx } from "@/lib/xlsx"

const LOTE = 1000
const MAX_LOTES = 50

/** Processos de aquisição em XLSX, com os filtros da tela e o escopo da pessoa (I8). */
export async function GET(request: NextRequest): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (
    !sessao ||
    !podeAcessar(sessao.permissoes, "aquisicoes_compras", [
      "aquisicoes_compras_edicao",
      "aquisicoes_compra_direta",
      "aquisicoes_avaliacoes",
      "aquisicoes_recebimentos",
      "aquisicoes_fornecedores",
      "aquisicoes_contratos",
    ])
  ) {
    return new Response("Sem acesso", { status: 403 })
  }
  const sp = new URL(request.url).searchParams
  const situacao = (SITUACOES_PROCESSO as readonly string[]).includes(sp.get("situacao") ?? "")
    ? (sp.get("situacao") as SituacaoProcesso)
    : "todas"
  const aq = sp.get("aquisicao")
  const aquisicao = aq === "direta" || aq === "via_compras" ? aq : "todas"
  const escopo = await escopoComprasDoUsuario(sessao.usuario.id)

  const linhas: ProcessoLinha[] = []
  for (let pagina = 1; pagina <= MAX_LOTES; pagina++) {
    const lote = await listarProcessos({ busca: (sp.get("busca") ?? "").trim(), situacao, aquisicao, pagina, porPagina: LOTE, escopo })
    linhas.push(...lote.linhas)
    if (pagina >= lote.totalPaginas || lote.linhas.length < LOTE) break
  }

  const bytes = planilhaXlsx("Aquisições", [
    { titulo: "Código", valor: (p) => p.codigo, largura: 22 },
    { titulo: "Produto / serviço", valor: (p) => p.produto, largura: 60 },
    { titulo: "Departamento", valor: (p) => p.departamentoNome },
    { titulo: "Projeto", valor: (p) => p.projetoNome },
    { titulo: "Modalidade", valor: (p) => (p.aquisicao_direta === null ? "" : p.aquisicao_direta ? "Aquisição direta" : "Via Aquisição") },
    { titulo: "Situação", valor: (p) => p.situacao },
    { titulo: "Valor da compra", valor: (p) => p.compra_valor },
    { titulo: "Abertura", valor: (p) => dataXlsx(p.created_at) },
  ], linhas)
  return respostaXlsx("aquisicoes", bytes)
}
