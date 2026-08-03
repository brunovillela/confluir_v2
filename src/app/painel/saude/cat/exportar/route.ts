import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import {
  facetasCat,
  listarCatsParaExportar,
  type FiltrosCat,
} from "@/lib/db/saude"
import { formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import {
  FILTROS_BOOLEANOS,
  lerDirecao,
  lerOrdem,
  OPCOES_REVISAO,
  rotuloTipoAcidente,
  TIPOS_ACIDENTE,
  type FiltroBooleano,
} from "@/lib/saude-constantes"

/**
 * Exporta a listagem de CATs com os filtros e a ordenação atuais.
 * Delimitador `;` e BOM UTF-8 — é o que o Excel pt-BR abre sem pedir
 * assistente de importação (mesmo padrão de /painel/filiados/exportar).
 */
export async function GET(request: NextRequest) {
  const sessao = await getSessaoPainel()
  if (
    !sessao ||
    !podeAcessar(sessao.permissoes, "saude_cat", [
      "saude_atendimento",
      "saude_gestao",
    ])
  ) {
    return new Response("Sem acesso", { status: 403 })
  }

  const sp = request.nextUrl.searchParams
  const tipo = sp.get("tipo") ?? ""
  const revisao = sp.get("revisao") ?? ""
  const vinculo = sp.get("vinculo") ?? ""

  // Mesma resolução de grafias da listagem, para o CSV sair com exatamente
  // as linhas que a tela mostrou.
  const municipioChave = sp.get("municipio") ?? ""
  const grupo = municipioChave
    ? (await facetasCat()).municipios.find((m) => m.chave === municipioChave)
    : undefined

  const filtros: FiltrosCat = {
    busca: (sp.get("busca") ?? "").trim(),
    ano: /^\d{4}$/.test(sp.get("ano") ?? "") ? (sp.get("ano") as string) : "",
    tipo: TIPOS_ACIDENTE.some((t) => t.valor === tipo) ? tipo : "",
    uf: (sp.get("uf") ?? "").slice(0, 2).toUpperCase(),
    municipio: grupo?.chave ?? "",
    municipioVariantes: grupo?.variantes ?? [],
    revisao: OPCOES_REVISAO.some((o) => o.valor === revisao) ? revisao : "todas",
    vinculo:
      vinculo === "vinculados" || vinculo === "sem_vinculo" ? vinculo : "",
    booleanos: Object.fromEntries(
      (Object.keys(FILTROS_BOOLEANOS) as FiltroBooleano[])
        .map((k) => [k, sp.get(k) ?? ""] as const)
        .filter(([, v]) => v === "sim" || v === "nao")
    ),
  }

  const linhas = await listarCatsParaExportar(
    filtros,
    lerOrdem(sp.get("ordem") ?? undefined),
    lerDirecao(sp.get("dir") ?? undefined)
  )

  const simNao = (v: boolean | null) => (v === true ? "Sim" : v === false ? "Não" : "")
  const escapar = (v: string) =>
    /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v

  const csv = [
    [
      "Nº da CAT",
      "Data do acidente",
      "Acidentado",
      "Empregador",
      "Tipo",
      "Município",
      "UF",
      "Código parte atingida",
      "Parte atingida",
      "CID-10",
      "Afastamento",
      "Internação",
      "Óbito",
      "Descrição a revisar",
      "Filiado vinculado",
    ].join(";"),
    ...linhas.map((c) =>
      [
        c.numero_cat ?? "",
        formatarData(c.data_acidente),
        c.trabalhador_nome ?? "",
        c.empregador_razao_social ?? "",
        rotuloTipoAcidente(c.tipo_acidente) ?? "",
        c.local_municipio ?? "",
        c.local_uf ?? "",
        c.parte_atingida_codigo ?? "",
        c.parte_atingida ?? "",
        c.cid10 ?? "",
        simNao(c.afastamento_durante_tratamento),
        simNao(c.houve_internacao),
        simNao(c.houve_morte),
        c.descricao_truncada === true ? "Sim" : "Não",
        c.filiado_id ? "Sim" : "Não",
      ]
        .map(escapar)
        .join(";")
    ),
  ].join("\r\n")

  const hoje = new Date().toISOString().slice(0, 10)
  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="cats-${hoje}.csv"`,
    },
  })
}
