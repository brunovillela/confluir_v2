import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import {
  descreverRecorte,
  registrarEmissao,
  selecionarDestinatarios,
} from "@/lib/db/comunicacao-etiquetas"
import { lerFiltrosEtiquetas, parametrosDaUrl } from "@/lib/etiquetas-pimaco"
import { linhasDoEndereco } from "@/lib/etiquetas-texto"
import { podeAcessar } from "@/lib/permissoes"

/**
 * Lista de endereçamento em CSV (mesmo recorte e ordem das etiquetas) — para
 * a lista de postagem dos Correios ou para uma gráfica que imprime direto no
 * envelope. Registra a emissão.
 */
export async function GET(request: NextRequest) {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "comunicacao_etiquetas", ["filiacao_gestao"])) {
    return new Response("Sem acesso", { status: 403 })
  }
  const filtros = lerFiltrosEtiquetas(parametrosDaUrl(new URL(request.url).searchParams))
  const selecao = await selecionarDestinatarios(filtros)

  const escapar = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
  const cabecalho = ["Nome", "Endereço", "Bairro", "Cidade", "UF", "CEP", "Matrícula sindical", "Condição sindical"]
  const csv = [
    cabecalho.join(";"),
    ...selecao.comEndereco.map((d) => {
      const l = linhasDoEndereco(d.endereco)
      return [l.nome, l.endereco, l.bairro, d.endereco.cidade ?? "", d.endereco.uf ?? "", l.cep, d.matricula ?? "", d.condicao ?? ""]
        .map(escapar)
        .join(";")
    }),
  ].join("\r\n")

  await registrarEmissao({
    usuarioId: sessao.usuario.id,
    tipo: "csv",
    quantidade: selecao.comEndereco.length,
    recorte: descreverRecorte(filtros, selecao.base),
  })

  const hoje = new Date().toISOString().slice(0, 10)
  return new Response("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="enderecamento-${hoje}.csv"`,
      "Cache-Control": "no-store",
    },
  })
}
