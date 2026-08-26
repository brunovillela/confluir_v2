import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { listarItens, type FiltrosItens } from "@/lib/db/patrimonio"
import { podeAcessar } from "@/lib/permissoes"

/**
 * Exporta a listagem de itens patrimoniais com os filtros atuais.
 * Delimitador `;` e BOM UTF-8 (padrão de /painel/juridico/processos/exportar).
 */
export async function GET(request: NextRequest) {
  const sessao = await getSessaoPainel()
  if (
    !sessao ||
    !podeAcessar(sessao.permissoes, "patrimonio_geral", ["patrimonio_leitura"])
  ) {
    return new Response("Sem acesso", { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const situacaoBruta = sp.get("situacao") ?? ""
  const filtros: FiltrosItens = {
    busca: (sp.get("busca") ?? "").trim(),
    situacao:
      situacaoBruta === "inativos" || situacaoBruta === "todos"
        ? situacaoBruta
        : "ativos",
  }

  const itens = await listarItens(filtros)

  const escapar = (v: string) =>
    /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v

  const csv = [
    [
      "Nome",
      "Nº de patrimônio",
      "Descrição",
      "Recinto",
      "Situação",
      "Em cautela",
      "Responsável (cautela)",
    ].join(";"),
    ...itens.map((i) =>
      [
        i.nome ?? "",
        i.numero_patrimonio ?? "",
        i.descricao ?? "",
        i.recintoNome ?? "",
        i.ativo ? "Ativo" : "Inativo",
        i.emCautela ? "Sim" : "Não",
        i.responsavelNome ?? "",
      ]
        .map((v) => escapar(String(v)))
        .join(";")
    ),
  ].join("\r\n")

  const hoje = new Date().toISOString().slice(0, 10)
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="patrimonio-${hoje}.csv"`,
    },
  })
}
