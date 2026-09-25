import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { filtrarViagens, listarViagens } from "@/lib/db/viagens"
import { formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import {
  lerFiltroViagens,
  ROTULO_BENEFICIARIO,
  ROTULO_MODAL,
  ROTULO_SITUACAO_VIAGEM,
} from "@/lib/viagens-constantes"

/**
 * Exporta a lista de viagens com os filtros da tela, UMA LINHA POR ITEM
 * (bilhete ou estadia) — é o que a conferência com a agência e a
 * contabilidade usam. Filtro de serviço ou de agência também recorta os
 * itens. Delimitador `;` e BOM UTF-8, como os outros CSVs do painel.
 */
export async function GET(request: NextRequest) {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "viagens_gestao")) {
    return new Response("Sem acesso", { status: 403 })
  }

  const filtro = lerFiltroViagens(Object.fromEntries(request.nextUrl.searchParams))
  const { viagens } = await listarViagens()
  const escapar = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const moeda = (v: number | null) => (v === null ? "" : v.toFixed(2).replace(".", ","))

  const linhas: string[][] = []
  for (const v of filtrarViagens(viagens, filtro)) {
    for (const i of v.itens) {
      if (filtro.tipo && i.tipo !== filtro.tipo) continue
      if (filtro.fornecedorId && i.fornecedorId !== filtro.fornecedorId) continue
      linhas.push([
        String(v.numero ?? ""),
        ROTULO_SITUACAO_VIAGEM[v.situacao],
        v.beneficiarioNome,
        ROTULO_BENEFICIARIO[v.beneficiarioTipo],
        v.departamentoNome ?? "",
        v.eventoTitulo ?? "",
        v.motivo,
        formatarData(v.createdAt),
        i.tipo === "passagem" ? "Passagem" : "Hospedagem",
        i.modal ? ROTULO_MODAL[i.modal] : "",
        i.tipo === "passagem" ? `${i.origem ?? ""} → ${i.destino ?? ""}` : (i.cidade ?? ""),
        i.tipo === "passagem"
          ? i.dataViagem
            ? formatarData(i.dataViagem)
            : ""
          : i.checkin
            ? formatarData(i.checkin)
            : "",
        i.checkout ? formatarData(i.checkout) : "",
        i.fornecedorNome ?? "",
        i.localizador ?? "",
        moeda(i.valor),
        i.faturaId ? "Sim" : "Não",
      ])
    }
  }

  const cabecalho = [
    "Viagem nº",
    "Situação",
    "Quem viaja",
    "Quadro",
    "Departamento",
    "Evento",
    "Motivo",
    "Pedida em",
    "Serviço",
    "Tipo de passagem",
    "Trecho / cidade",
    "Data / check-in",
    "Check-out",
    "Agência",
    "Localizador",
    "Valor (R$)",
    "Faturado",
  ]
  const csv = [cabecalho, ...linhas].map((l) => l.map(escapar).join(";")).join("\r\n")
  const hoje = new Date().toISOString().slice(0, 10)
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="viagens-${hoje}.csv"`,
    },
  })
}
