import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { formatarCpf } from "@/lib/cpf"
import {
  listarHomologacoesParaExportar,
  type FiltrosHomologacao,
} from "@/lib/db/juridico"
import { formatarData } from "@/lib/formato"
import {
  filtroFiliacaoValido,
  lerDirecao,
  lerOrdem,
  motivoValido,
} from "@/lib/juridico-constantes"
import { podeAcessar } from "@/lib/permissoes"

/**
 * Exporta a listagem de homologações com os filtros e a ordenação atuais.
 * Delimitador `;` e BOM UTF-8 — é o que o Excel pt-BR abre sem assistente
 * (mesmo padrão de /painel/saude/cat/exportar).
 */
export async function GET(request: NextRequest) {
  const sessao = await getSessaoPainel()
  if (
    !sessao ||
    !podeAcessar(sessao.permissoes, "juridico_homologacoes", [
      "juridico_geral",
      "juridico_gestao",
    ])
  ) {
    return new Response("Sem acesso", { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const filtros: FiltrosHomologacao = {
    busca: (sp.get("busca") ?? "").trim(),
    ano: /^\d{4}$/.test(sp.get("ano") ?? "") ? (sp.get("ano") as string) : "",
    motivo: motivoValido(sp.get("motivo") ?? "") ? (sp.get("motivo") as string) : "",
    filiacao: filtroFiliacaoValido(sp.get("filiacao") ?? "")
      ? (sp.get("filiacao") as FiltrosHomologacao["filiacao"])
      : "todos",
    fonteId: sp.get("fonte") ?? "",
  }

  const linhas = await listarHomologacoesParaExportar(
    filtros,
    lerOrdem(sp.get("ordem") ?? undefined),
    lerDirecao(sp.get("dir") ?? undefined)
  )

  const escapar = (v: string) =>
    /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v

  const csv = [
    [
      "Data da homologação",
      "Data da demissão",
      "Trabalhador",
      "CPF",
      "Vínculo",
      "Empregador",
      "Motivo",
      "Parecer",
      "Observações",
    ].join(";"),
    ...linhas.map((h) =>
      [
        formatarData(h.data),
        h.data_demissao ? formatarData(h.data_demissao) : "",
        h.trabalhador ?? "",
        h.cpf ? formatarCpf(h.cpf) : "",
        h.filiado ? "Filiado" : "Não-filiado",
        h.empregador ?? "",
        h.motivo ?? "",
        h.parecer_url ? "Sim" : "Não",
        h.observacoes ?? "",
      ]
        .map((v) => escapar(String(v)))
        .join(";")
    ),
  ].join("\r\n")

  const hoje = new Date().toISOString().slice(0, 10)
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="homologacoes-${hoje}.csv"`,
    },
  })
}
