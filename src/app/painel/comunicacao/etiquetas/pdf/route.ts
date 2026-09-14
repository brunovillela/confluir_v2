import { createElement } from "react"
import type { NextRequest } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"

import { getSessaoPainel } from "@/lib/auth"
import {
  descreverRecorte,
  folhasDoLote,
  registrarEmissao,
  selecionarDestinatarios,
} from "@/lib/db/comunicacao-etiquetas"
import { listarSedes, obterOrganizacao } from "@/lib/db/organizacao"
import {
  areaUtil,
  lerFiltrosEtiquetas,
  lerOpcoesEtiquetas,
  parametrosDaUrl,
  planoDeLotes,
  porFolha,
} from "@/lib/etiquetas-pimaco"
import { blocosDoDestinatario, encaixarBlocos } from "@/lib/etiquetas-texto"
import { podeAcessar } from "@/lib/permissoes"
import { EtiquetasPDF, type FolhaDeEtiquetas } from "@/lib/pdf/etiquetas"

export const runtime = "nodejs"
export const maxDuration = 60

/**
 * PDF das etiquetas. `tipo`:
 * - `destinatarios` (padrão): o lote `lote` do recorte da URL — registra a emissão;
 * - `teste`: uma folha só com contornos numerados, sem dado nenhum, para
 *   conferir o alinhamento da impressora em papel comum;
 * - `remetente`: folhas com o endereço de uma sede (`sede`, `folhas`).
 */
export async function GET(request: NextRequest) {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "comunicacao_etiquetas", ["filiacao_gestao"])) {
    return new Response("Sem acesso", { status: 403 })
  }
  const url = new URL(request.url)
  const brutos = parametrosDaUrl(url.searchParams)
  const opcoes = lerOpcoesEtiquetas(brutos)
  const { modelo } = opcoes
  const tipo = url.searchParams.get("tipo") ?? "destinatarios"
  const pf = porFolha(modelo)

  let folhas: FolhaDeEtiquetas[]
  let nomeArquivo: string
  let titulo: string

  if (tipo === "teste") {
    folhas = [{ posicoes: Array.from({ length: pf }, () => null) }]
    nomeArquivo = `teste-pimaco-${modelo.codigo}.pdf`
    titulo = `Folha de teste — Pimaco ${modelo.codigo}`
  } else if (tipo === "remetente") {
    const [organizacao, { sedes }] = await Promise.all([
      obterOrganizacao(),
      listarSedes().catch(() => ({ disponivel: false, sedes: [] })),
    ])
    const sede = sedes.find((s) => s.id === url.searchParams.get("sede")) ?? sedes[0]
    if (!sede) return new Response("Cadastre uma sede com endereço em Institucional → Organização.", { status: 400 })
    const quantasFolhas = Math.min(Math.max(Number(url.searchParams.get("folhas")) || 1, 1), 20)
    const area = areaUtil(modelo)
    const blocos = blocosDoDestinatario(
      {
        nome: organizacao?.nomeFantasia ?? organizacao?.nomeRazao ?? null,
        logradouro: sede.logradouro,
        numero: sede.numero,
        complemento: sede.complemento,
        bairro: sede.bairro,
        cidade: sede.cidade,
        uf: sede.estado,
        cep: sede.cep,
      },
      { caixaAlta: opcoes.caixaAlta }
    )
    const linhas = encaixarBlocos(
      [{ texto: "Remetente", maxLinhas: 1, escala: 0.75, dispensavel: true }, ...blocos],
      area.largura,
      area.altura,
      area.corpoMaximo
    )
    folhas = Array.from({ length: quantasFolhas }, () => ({
      posicoes: Array.from({ length: pf }, () => linhas),
    }))
    nomeArquivo = `remetente-pimaco-${modelo.codigo}.pdf`
    titulo = `Etiquetas de remetente — Pimaco ${modelo.codigo}`
  } else {
    const filtros = lerFiltrosEtiquetas(brutos)
    const selecao = await selecionarDestinatarios(filtros)
    const lotes = planoDeLotes(selecao.comEndereco.length, modelo, opcoes.inicio)
    const lote = lotes.find((l) => l.numero === Number(url.searchParams.get("lote") ?? 1))
    if (!lote) return new Response("Nenhuma etiqueta neste recorte.", { status: 404 })
    folhas = folhasDoLote(selecao.comEndereco, opcoes, lote)
    const sufixo = lotes.length > 1 ? `-lote-${lote.numero}-de-${lotes.length}` : ""
    nomeArquivo = `etiquetas-pimaco-${modelo.codigo}${sufixo}.pdf`
    titulo = `Etiquetas — Pimaco ${modelo.codigo}${lotes.length > 1 ? ` — lote ${lote.numero} de ${lotes.length}` : ""}`
    await registrarEmissao({
      usuarioId: sessao.usuario.id,
      tipo: "pdf",
      modelo: modelo.codigo,
      lote:
        lotes.length > 1
          ? `${lote.numero} de ${lotes.length} (etiquetas ${lote.de.toLocaleString("pt-BR")}–${lote.ate.toLocaleString("pt-BR")})`
          : null,
      quantidade: lote.ate - lote.de + 1,
      recorte: descreverRecorte(filtros, selecao.base),
    })
  }

  const elemento = createElement(EtiquetasPDF, {
    modelo,
    folhas,
    titulo,
    contorno: opcoes.contorno || tipo === "teste",
    numerar: tipo === "teste",
    ajusteX: opcoes.ajusteX,
    ajusteY: opcoes.ajusteY,
  }) as Parameters<typeof renderToBuffer>[0]
  const buffer = await renderToBuffer(elemento)

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${nomeArquivo}"`,
      "Cache-Control": "no-store",
    },
  })
}
