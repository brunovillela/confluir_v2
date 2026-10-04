import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { lancamentosContabeis, type LancamentoDespesa, type LancamentoReceita } from "@/lib/db/contabil"
import { podeAcessar } from "@/lib/permissoes"
import { type ColunaXlsx, dataXlsx, planilhaXlsxAbas, respostaXlsx } from "@/lib/xlsx"

import { periodoContabil } from "../periodo"

/** Lançamentos do período em XLSX: aba Despesas (ordens pagas) e aba Receitas (arrecadação). */
export async function GET(request: NextRequest): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "financeiro_leitura", ["financeiro_pagamento"])) {
    return new Response("Sem acesso", { status: 403 })
  }
  const sp = new URL(request.url).searchParams
  const { de, ate } = periodoContabil(sp.get("de"), sp.get("ate"))
  const l = await lancamentosContabeis(de, ate)

  const despesas: ColunaXlsx<LancamentoDespesa>[] = [
    { titulo: "Pagamento", valor: (d) => dataXlsx(d.dataPagamento), largura: 12 },
    { titulo: "Vencimento", valor: (d) => dataXlsx(d.vencimento), largura: 12 },
    { titulo: "Código", valor: (d) => d.codigo, largura: 20 },
    { titulo: "Tipo", valor: (d) => d.tipo, largura: 16 },
    { titulo: "Favorecido", valor: (d) => d.favorecido, largura: 36 },
    { titulo: "CNPJ/CPF", valor: (d) => d.documento, largura: 20 },
    { titulo: "Descrição", valor: (d) => d.descricao, largura: 60 },
    { titulo: "Classificador", valor: (d) => d.classificador, largura: 14 },
    { titulo: "Centro de custo", valor: (d) => d.centroCusto, largura: 32 },
    { titulo: "Departamento", valor: (d) => d.departamento, largura: 24 },
    { titulo: "Forma", valor: (d) => d.formaPagamento, largura: 16 },
    { titulo: "Valor pago", valor: (d) => d.valorPago, largura: 14 },
    { titulo: "Valor cobrado", valor: (d) => d.valorCobrado, largura: 14 },
    { titulo: "Nota fiscal", valor: (d) => (d.notaFiscal ? "Sim" : "Não"), largura: 10 },
  ]
  const receitas: ColunaXlsx<LancamentoReceita>[] = [
    { titulo: "Competência", valor: (r) => r.mes, largura: 12 },
    { titulo: "Tipo", valor: (r) => r.tipo, largura: 18 },
    { titulo: "Fonte pagadora", valor: (r) => r.fonte, largura: 36 },
    { titulo: "Valor", valor: (r) => r.valor, largura: 14 },
    { titulo: "Lançamentos", valor: (r) => r.lancamentos, largura: 12 },
    { titulo: "Pagantes", valor: (r) => r.pagantes, largura: 12 },
  ]
  const bytes = planilhaXlsxAbas([
    { aba: "Despesas", colunas: despesas as ColunaXlsx<unknown>[], linhas: l.despesas },
    { aba: "Receitas", colunas: receitas as ColunaXlsx<unknown>[], linhas: l.receitas },
  ])
  return respostaXlsx(`contabil-${de}-a-${ate}`, bytes)
}
