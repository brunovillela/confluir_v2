import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { formatarCpf } from "@/lib/cpf"
import {
  listarFiliadosParaExportar,
  type FiltrosFiliados,
} from "@/lib/db/filiados"
import { FILIACAO_CONDICOES, GRUPOS_CONDICAO } from "@/lib/filiacao"
import { formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { dataXlsx, planilhaXlsx, respostaXlsx } from "@/lib/xlsx"

/** Exporta a listagem de filiados (com os filtros atuais) em CSV. */
export async function GET(request: NextRequest) {
  const sessao = await getSessaoPainel()
  if (
    !sessao ||
    !podeAcessar(sessao.permissoes, "filiacao_filiados", [
      "filiacao_gestao",
      "filiacao_receitas",
    ])
  ) {
    return new Response("Sem acesso", { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const situacoes = ["todas", "ativas", "excluidas"] as const
  const situacao = searchParams.get("situacao")
  const condicao = searchParams.get("condicao")
  const condicoes = [
    ...FILIACAO_CONDICOES,
    "nenhuma",
    ...Object.keys(GRUPOS_CONDICAO),
  ]
  const sexo = searchParams.get("sexo")
  const sexos = ["Masculino", "Feminino", "Outro", "nenhum"]
  const fonte = searchParams.get("fonte") ?? ""
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  const filtros: FiltrosFiliados = {
    busca: searchParams.get("busca") ?? "",
    situacao: situacoes.includes(situacao as never)
      ? (situacao as (typeof situacoes)[number])
      : "ativas",
    condicao:
      condicao && condicoes.includes(condicao as never) ? condicao : "todas",
    sexo: sexo && sexos.includes(sexo) ? sexo : "todos",
    fonte: uuid.test(fonte) ? fonte : "",
  }

  const linhas = await listarFiliadosParaExportar(filtros)

  // XLSX (I8): mesma seleção, planilha de verdade (datas e filtros no Excel).
  if (searchParams.get("formato") === "xlsx") {
    return respostaXlsx(
      "filiados",
      planilhaXlsx("Filiados", [
        { titulo: "Nome", valor: (f) => f.nome_completo, largura: 40 },
        { titulo: "CPF", valor: (f) => (f.cpf ? formatarCpf(f.cpf) : null) },
        { titulo: "Matrícula", valor: (f) => f.matricula_sindical },
        { titulo: "Lotação", valor: (f) => f.filiacao_lotacao, largura: 28 },
        { titulo: "Condição", valor: (f) => f.filiacao_condicao },
        { titulo: "Situação", valor: (f) => (f.filiacao_excluida === true ? "Excluída" : "Ativa") },
        { titulo: "Cadastro", valor: (f) => dataXlsx(f.created_at) },
      ], linhas)
    )
  }

  const escapar = (v: string) =>
    /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
  const csv = [
    ["Nome", "CPF", "Matrícula", "Lotação", "Condição", "Situação", "Cadastro"].join(";"),
    ...linhas.map((f) =>
      [
        f.nome_completo ?? "",
        f.cpf ? formatarCpf(f.cpf) : "",
        f.matricula_sindical ?? "",
        f.filiacao_lotacao ?? "",
        f.filiacao_condicao ?? "",
        f.filiacao_excluida === true ? "Excluída" : "Ativa",
        formatarData(f.created_at),
      ]
        .map(escapar)
        .join(";")
    ),
  ].join("\r\n")

  const hoje = new Date().toISOString().slice(0, 10)
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="filiados-${hoje}.csv"`,
    },
  })
}
