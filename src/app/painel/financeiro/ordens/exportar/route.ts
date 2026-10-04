import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { filtroSituacaoOrdem, listarOrdens, type FiltrosOrdens, type OrdemLinha } from "@/lib/db/financeiro"
import { podeAcessar } from "@/lib/permissoes"
import { dataXlsx, planilhaXlsx, respostaXlsx } from "@/lib/xlsx"

const LOTE = 1000
const MAX_LOTES = 50

/** Ordens de pagamento em XLSX, com os filtros e a ordem da tela (I8). */
export async function GET(request: NextRequest): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "financeiro_pagamento", ["financeiro_leitura"])) {
    return new Response("Sem acesso", { status: 403 })
  }
  const sp = new URL(request.url).searchParams
  const ordens = ["vencimento", "pagamento", "valor"] as const
  const ordem = sp.get("ordem") ?? ""
  const base: FiltrosOrdens = {
    busca: sp.get("busca") ?? "",
    situacao: filtroSituacaoOrdem(sp.get("situacao") ?? undefined),
    tipo: sp.get("tipo") || "todos",
    beneficiario: sp.get("beneficiario") ?? "",
    centroCusto: sp.get("centroCusto") ?? "",
    departamento: sp.get("departamento") ?? "",
    projeto: sp.get("projeto") ?? "",
    formaPagamento: sp.get("formaPagamento") ?? "",
    ordem: ordens.includes(ordem as never) ? (ordem as (typeof ordens)[number]) : "vencimento",
    dir: sp.get("dir") === "asc" ? "asc" : "desc",
  }

  // Todas as páginas, em lotes de 1.000 (teto do PostgREST por resposta).
  const linhas: OrdemLinha[] = []
  for (let pagina = 1; pagina <= MAX_LOTES; pagina++) {
    const lote = await listarOrdens({ ...base, pagina, porPagina: LOTE })
    linhas.push(...lote.linhas)
    if (pagina >= lote.totalPaginas || lote.linhas.length < LOTE) break
  }

  const bytes = planilhaXlsx("Ordens", [
    { titulo: "Código", valor: (o) => o.codigo, largura: 22 },
    { titulo: "Tipo", valor: (o) => o.tipo },
    { titulo: "Descrição", valor: (o) => o.descricao, largura: 60 },
    { titulo: "Favorecido", valor: (o) => o.favorecido, largura: 36 },
    { titulo: "Situação", valor: (o) => o.situacao },
    { titulo: "Forma", valor: (o) => o.forma_pagamento },
    { titulo: "Valor", valor: (o) => o.valor_inicial_cobranca },
    { titulo: "Valor pago", valor: (o) => o.valor_pago },
    { titulo: "Vencimento", valor: (o) => dataXlsx(o.vencimento) },
    { titulo: "Pagamento", valor: (o) => dataXlsx(o.data_pagamento) },
  ], linhas)
  return respostaXlsx("ordens-de-pagamento", bytes)
}
