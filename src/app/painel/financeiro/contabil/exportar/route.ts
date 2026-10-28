import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { lancamentosContabeis, type LancamentoDespesa, type LancamentoReceita } from "@/lib/db/contabil"
import { rpasPagosNoPeriodo, totalizarRpas, type LinhaRpaContabil } from "@/lib/db/contabil-rpa"
import { registrarExportacao } from "@/lib/exportacoes"
import { podeAcessar } from "@/lib/permissoes"
import { type ColunaXlsx, dataXlsx, planilhaXlsxAbas, respostaXlsx } from "@/lib/xlsx"

import { periodoContabil } from "../periodo"

/**
 * Lançamentos do período em XLSX: aba Despesas (ordens pagas), aba Receitas
 * (arrecadação) e aba RPAs (bruto, retenções, INSS patronal e custo dos RPAs
 * pagos no período — a Despesas só tem o líquido).
 */
export async function GET(request: NextRequest): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "financeiro_leitura", ["financeiro_pagamento"])) {
    return new Response("Sem acesso", { status: 403 })
  }
  const sp = new URL(request.url).searchParams
  const { de, ate } = periodoContabil(sp.get("de"), sp.get("ate"))
  const [l, rpas] = await Promise.all([lancamentosContabeis(de, ate), rpasPagosNoPeriodo(de, ate)])
  await registrarExportacao(request, { usuarioId: sessao.usuario.id, recurso: "contabil", formato: "xlsx", quantidade: l.despesas.length + l.receitas.length + rpas.length, filtros: { de, ate } })

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
  const colunasRpa: ColunaXlsx<LinhaRpaContabil>[] = [
    { titulo: "Pagamento", valor: (r) => (r.rpaId ? dataXlsx(r.dataPagamento) : null), largura: 12 },
    { titulo: "Competência", valor: (r) => r.competencia, largura: 12 },
    { titulo: "RPA nº", valor: (r) => r.numero, largura: 8 },
    { titulo: "Prestador", valor: (r) => r.prestador, largura: 36 },
    { titulo: "CPF", valor: (r) => r.cpf, largura: 16 },
    { titulo: "Serviço", valor: (r) => r.servico, largura: 50 },
    { titulo: "Origem", valor: (r) => r.origem, largura: 26 },
    { titulo: "Ordem", valor: (r) => r.ordemCodigo, largura: 20 },
    { titulo: "Classificador", valor: (r) => r.classificador, largura: 14 },
    { titulo: "Centro de custo", valor: (r) => r.centroCusto, largura: 30 },
    { titulo: "Departamento", valor: (r) => r.departamento, largura: 22 },
    { titulo: "Bruto", valor: (r) => r.bruto, largura: 13 },
    { titulo: "INSS retido", valor: (r) => r.inss, largura: 12 },
    { titulo: "IRRF retido", valor: (r) => r.irrf, largura: 12 },
    { titulo: "ISS retido", valor: (r) => r.iss, largura: 12 },
    { titulo: "Líquido", valor: (r) => r.liquido, largura: 13 },
    { titulo: "Valor pago", valor: (r) => r.valorPago, largura: 13 },
    { titulo: "INSS patronal", valor: (r) => r.inssPatronal, largura: 13 },
    { titulo: "Custo total (bruto + patronal)", valor: (r) => r.custoTotal, largura: 16 },
    { titulo: "Recibo assinado", valor: (r) => (r.rpaId ? (r.assinado ? "Sim" : "Não") : null), largura: 10 },
  ]
  // Linha final de totais (sem rpaId: data e "assinado" ficam vazios).
  const t = totalizarRpas(rpas)
  const totalRpas: LinhaRpaContabil = {
    rpaId: "",
    numero: null,
    dataPagamento: "",
    competencia: "",
    prestador: `TOTAL (${t.quantidade} RPA${t.quantidade === 1 ? "" : "s"})`,
    cpf: null,
    servico: null,
    origem: "",
    ordemCodigo: null,
    centroCusto: null,
    classificador: null,
    departamento: null,
    bruto: t.bruto,
    inss: t.inss,
    irrf: t.irrf,
    iss: t.iss,
    liquido: t.liquido,
    valorPago: Math.round(rpas.reduce((s, r) => s + r.valorPago, 0) * 100) / 100,
    inssPatronal: t.inssPatronal,
    custoTotal: t.custoTotal,
    assinado: false,
  }
  const bytes = planilhaXlsxAbas([
    { aba: "Despesas", colunas: despesas as ColunaXlsx<unknown>[], linhas: l.despesas },
    { aba: "Receitas", colunas: receitas as ColunaXlsx<unknown>[], linhas: l.receitas },
    { aba: "RPAs", colunas: colunasRpa as ColunaXlsx<unknown>[], linhas: rpas.length ? [...rpas, totalRpas] : [] },
  ])
  return respostaXlsx(`contabil-${de}-a-${ate}`, bytes)
}
