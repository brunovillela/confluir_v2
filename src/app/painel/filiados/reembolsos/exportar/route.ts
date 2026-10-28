import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { andamentoDoReembolso, todosReembolsos, valorDoReembolso } from "@/lib/db/filiacao-reembolsos-edicao"
import { registrarExportacao } from "@/lib/exportacoes"
import { podeAcessar } from "@/lib/permissoes"
import { rotuloTipoReembolso } from "@/lib/reembolsos-tipos"
import { dataXlsx, planilhaXlsx, respostaXlsx } from "@/lib/xlsx"

import { lerFiltroReembolsos } from "../filtro"

const ANDAMENTO = { pago: "Pago", aberto: "Em aberto", fora: "Fora (sem ordem, cancelada ou estornada)" } as const

/** Lista de reembolsos a filiados em XLSX, com os filtros da tela (I8). */
export async function GET(request: NextRequest): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "filiacao_reembolsos", ["filiacao_gestao"])) {
    return new Response("Sem acesso", { status: 403 })
  }
  const sp = Object.fromEntries(new URL(request.url).searchParams.entries())
  const linhas = await todosReembolsos(lerFiltroReembolsos(sp))
  await registrarExportacao(request, { usuarioId: sessao.usuario.id, recurso: "reembolsos", formato: "xlsx", quantidade: linhas.length })
  const bytes = planilhaXlsx("Reembolsos", [
    { titulo: "Data de referência", valor: (r) => dataXlsx(r.data) },
    { titulo: "Filiado", valor: (r) => r.filiadoNome, largura: 36 },
    { titulo: "CPF", valor: (r) => r.filiadoCpf, largura: 14 },
    { titulo: "Tipo", valor: (r) => rotuloTipoReembolso(r.tipo), largura: 28 },
    { titulo: "Justificativa", valor: (r) => r.justificativa, largura: 48 },
    { titulo: "Projeto", valor: (r) => r.projeto, largura: 30 },
    { titulo: "Valor", valor: (r) => valorDoReembolso(r), largura: 12 },
    { titulo: "Ordem", valor: (r) => (r.ordem && !r.ordem.excluido ? r.ordem.codigo : null), largura: 26 },
    { titulo: "Situação da ordem", valor: (r) => (r.ordem && !r.ordem.excluido ? r.ordem.situacao : "sem ordem"), largura: 22 },
    { titulo: "Pagamento", valor: (r) => dataXlsx(r.ordem && !r.ordem.excluido ? r.ordem.data_pagamento : null) },
    { titulo: "Andamento", valor: (r) => ANDAMENTO[andamentoDoReembolso(r)], largura: 22 },
  ], linhas)
  return respostaXlsx("reembolsos", bytes)
}
