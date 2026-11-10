import "server-only"

import type { NextRequest } from "next/server"

import { requirePermissao } from "@/lib/auth"
import { obterRodada, todosAptos, type AptoExtracao, type FiltroLinkApto, type FiltrosAptos } from "@/lib/db/assembleias"
import { caminhoVotacao } from "@/lib/db/votacao-caminho"
import { registrarExportacao } from "@/lib/exportacoes"

/**
 * Extração dos aptos da rodada (09/11/2026): os mesmos filtros da aba Aptos
 * (busca, já votou / não votou, situação do link pessoal), lidos da URL, e
 * TODAS as linhas filtradas — não só a página. A planilha e o PDF usam isto.
 */

export type ExtracaoAptos = {
  linhas: AptoExtracao[]
  campanha: string | null
  rodada: string | null
  fonte: string | null
  filtro: string
  /** Para o nome do arquivo. */
  codigo: string
}

const ROTULO_LINK: Record<FiltroLinkApto, string> = {
  sem_link: "sem link pessoal (ainda não votaram)",
  sem_email: "sem e-mail",
  falha: "falha no envio do link",
  duplicado: "e-mail repetido",
}

export async function lerExtracaoAptos(
  request: NextRequest,
  rodadaId: string,
  formato: "xlsx" | "pdf"
): Promise<ExtracaoAptos | Response> {
  const sessao = await requirePermissao("assembleias")
  const rodada = await obterRodada(rodadaId)
  if (!rodada) return new Response("Rodada não encontrada", { status: 404 })
  const sp = request.nextUrl.searchParams
  const link = (["sem_link", "sem_email", "falha", "duplicado"] as const).find((v) => v === sp.get("link"))
  const votouBruto = sp.get("votou")
  // Como na tela: o filtro do link exclui o de voto.
  const votou = !link && (votouBruto === "sim" || votouBruto === "nao") ? votouBruto : undefined
  const busca = (sp.get("busca") ?? "").trim() || undefined
  const filtros: FiltrosAptos = { busca, votou, link }

  const [linhas, caminho] = await Promise.all([
    todosAptos(rodadaId, filtros),
    caminhoVotacao({ rodadaId }),
  ])
  const partes = [
    link ? ROTULO_LINK[link] : votou === "sim" ? "já votaram" : votou === "nao" ? "não votaram" : "todos os aptos",
    busca ? `busca "${busca}"` : null,
  ].filter(Boolean)
  await registrarExportacao(request, {
    usuarioId: sessao.usuario.id,
    recurso: "aptos_rodada",
    formato,
    quantidade: linhas.length,
    filtros: { rodada: rodadaId, ...(busca ? { busca } : {}), ...(votou ? { votou } : {}), ...(link ? { link } : {}) },
  })
  return {
    linhas,
    campanha: caminho.campanha?.nome ?? rodada.campanhaTema ?? null,
    rodada: rodada.nome,
    // As fontes da campanha (a escolhida na navegação não filtra os aptos).
    fonte: caminho.fontesDaCampanha.map((f) => f.nome).filter(Boolean).join(", ") || null,
    filtro: partes.join(" · "),
    codigo: (rodada.codigo || rodadaId.slice(0, 8)).replace(/[^\w-]+/g, "-"),
  }
}
