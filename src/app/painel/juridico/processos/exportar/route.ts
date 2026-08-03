import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import {
  listarProcessosParaExportar,
  type FiltrosProcesso,
} from "@/lib/db/juridico"
import { formatarData } from "@/lib/formato"
import {
  filtroAndamentoValido,
  filtroNaturezaValido,
  lerDirecao,
  lerOrdemProcesso,
  statusProcessoValido,
  tipoProcessoValido,
} from "@/lib/juridico-constantes"
import { podeAcessar } from "@/lib/permissoes"

/**
 * Exporta a listagem de processos com os filtros e a ordenação atuais.
 * Delimitador `;` e BOM UTF-8 (padrão de /painel/saude/cat/exportar).
 */
export async function GET(request: NextRequest) {
  const sessao = await getSessaoPainel()
  if (
    !sessao ||
    !podeAcessar(sessao.permissoes, "juridico_geral", [
      "juridico_gestao",
      "juridico_homologacoes",
    ])
  ) {
    return new Response("Sem acesso", { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const filtros: FiltrosProcesso = {
    busca: (sp.get("busca") ?? "").trim(),
    tipo: tipoProcessoValido(sp.get("tipo") ?? "") ? (sp.get("tipo") as string) : "",
    status: statusProcessoValido(sp.get("status") ?? "")
      ? (sp.get("status") as string)
      : "",
    andamento: filtroAndamentoValido(sp.get("andamento") ?? "")
      ? (sp.get("andamento") as FiltrosProcesso["andamento"])
      : "todos",
    natureza: filtroNaturezaValido(sp.get("natureza") ?? "")
      ? (sp.get("natureza") as FiltrosProcesso["natureza"])
      : "todas",
    filiadoId: sp.get("filiado") ?? "",
  }

  const linhas = await listarProcessosParaExportar(
    filtros,
    lerOrdemProcesso(sp.get("ordem") ?? undefined),
    lerDirecao(sp.get("dir") ?? undefined)
  )

  const escapar = (v: string) =>
    /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v

  const csv = [
    [
      "Número",
      "Data de abertura",
      "Área",
      "Natureza",
      "Status",
      "Situação",
      "Responsável",
      "Filiados envolvidos",
      "Parte assessorada",
      "Parte(s) contrária(s)",
      "Observações",
    ].join(";"),
    ...linhas.map((p) =>
      [
        p.numero_processo ?? "",
        p.data_abertura ? formatarData(p.data_abertura) : "",
        p.tipo ?? "",
        p.coletivo ? "Coletivo" : "Individual",
        p.status_processo ?? "",
        p.finalizado ? "Finalizado" : "Em andamento",
        p.responsavel ?? "",
        p.filiados.map((f) => f.nome ?? "(sem nome)").join(" | "),
        p.parte_assessorada ?? "",
        (p.outras_partes ?? []).join(" | "),
        p.observacoes ?? "",
      ]
        .map((v) => escapar(String(v)))
        .join(";")
    ),
  ].join("\r\n")

  const hoje = new Date().toISOString().slice(0, 10)
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="processos-${hoje}.csv"`,
    },
  })
}
