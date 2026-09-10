import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import {
  baseRelatorios,
  colunasDoPedido,
  ehModelo,
  filtrarRelatorio,
  FILTROS_FIXOS,
  valorDaColuna,
  type FiltrosRelatorio,
} from "@/lib/db/filiacao-relatorios"
import { COLUNAS_RELATORIO } from "@/lib/filiacao-relatorios-constantes"
import { podeAcessar } from "@/lib/permissoes"

/** Exporta um relatório de filiados (modelo + filtros da URL) em CSV. */
export async function GET(request: NextRequest) {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "filiacao_gestao")) {
    return new Response("Sem acesso", { status: 403 })
  }
  const { searchParams } = new URL(request.url)
  const modelo = searchParams.get("modelo") ?? ""
  if (!ehModelo(modelo)) return new Response("Modelo inválido", { status: 400 })

  const brutos: FiltrosRelatorio = {}
  for (const [k, v] of searchParams.entries()) {
    if (k !== "modelo") (brutos as Record<string, string>)[k] = v
  }
  const filtros: FiltrosRelatorio = { ...brutos, ...FILTROS_FIXOS[modelo] }
  const colunas = colunasDoPedido(modelo, filtros.colunas)
  const linhas = filtrarRelatorio(await baseRelatorios(), filtros)

  const escapar = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const cabecalho = colunas.map((c) => COLUNAS_RELATORIO.find((x) => x.chave === c)?.rotulo ?? c)
  const csv = [
    cabecalho.join(";"),
    ...linhas.map((l) => colunas.map((c) => escapar(valorDaColuna(l, c))).join(";")),
  ].join("\r\n")

  const hoje = new Date().toISOString().slice(0, 10)
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="relatorio-${modelo}-${hoje}.csv"`,
    },
  })
}
