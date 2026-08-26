import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import {
  ROTULOS_SITUACAO_CUSTEIO,
  ROTULO_TIPO_BENEFICIARIO,
  type SituacaoCusteio,
} from "@/lib/custeio-constantes"
import { listarCusteios } from "@/lib/db/custeio"
import { podeAcessar } from "@/lib/permissoes"

/**
 * Exporta a listagem de custeios com os filtros atuais.
 * Delimitador `;` e BOM UTF-8 (padrão de /painel/patrimonio/exportar).
 */
export async function GET(request: NextRequest) {
  const sessao = await getSessaoPainel()
  if (
    !sessao ||
    !podeAcessar(sessao.permissoes, "custeio_institucional", [
      "custeio_institucional_edicao",
      "custeio_institucional_autorizacao",
    ])
  ) {
    return new Response("Sem acesso", { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const custeios = await listarCusteios({
    busca: (sp.get("busca") ?? "").trim(),
    situacao: (sp.get("situacao") ?? "").trim() || "todas",
    finalidadeId: (sp.get("finalidade") ?? "").trim() || undefined,
  })

  const escapar = (v: string) =>
    /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v

  const csv = [
    [
      "Código",
      "Beneficiário",
      "Tipo",
      "Finalidade",
      "Valor da parcela",
      "Cadência",
      "Nº de parcelas",
      "1º vencimento",
      "Situação",
    ].join(";"),
    ...custeios.map((c) =>
      [
        c.codigo ?? "",
        c.beneficiario_nome ?? "",
        ROTULO_TIPO_BENEFICIARIO[c.tipo_beneficiario] ?? c.tipo_beneficiario,
        c.finalidade_nome ?? "",
        c.valor_parcela != null ? String(c.valor_parcela).replace(".", ",") : "",
        c.cadencia === "recorrente" ? "Recorrente" : "Pontual",
        String(c.num_parcelas),
        c.primeiro_vencimento?.slice(0, 10) ?? "",
        ROTULOS_SITUACAO_CUSTEIO[c.situacao as SituacaoCusteio] ?? c.situacao,
      ]
        .map((v) => escapar(String(v)))
        .join(";")
    ),
  ].join("\r\n")

  const hoje = new Date().toISOString().slice(0, 10)
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="custeios-${hoje}.csv"`,
    },
  })
}
