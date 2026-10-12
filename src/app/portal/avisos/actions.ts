"use server"

import { refresh } from "next/cache"

import { getSessaoPortal } from "@/lib/auth"
import { marcarAvisosLidos } from "@/lib/db/portal-avisos"
import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/**
 * Lido por item e "Marcar todos como lidos" (A100). A identidade é a sessão
 * do portal, nunca um CPF vindo da tela; e a visualização pela gestão não lê
 * pelo associado — se quem visualiza também tem conta no portal, gravaria
 * na conta DELE.
 *
 * Quando algo muda, `refresh()` refaz a casca: o sino e o selo do menu
 * passam a contar o que sobrou. Disparada no clique de um aviso com link, a
 * navegação descarta a resposta desta action, e o roteador faz o refresh
 * quando ela termina.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** CPF do associado logado; null na visualização pela gestão ou sem sessão. */
async function cpfDoAssociado(): Promise<string | null> {
  if ((await getVisualizacaoPortal())?.preview) return null
  return (await getSessaoPortal())?.filiado.cpf ?? null
}

/** Avisos vistos na lista (os sem link) ou abertos por ela (os com link). */
export async function marcarAvisosLidosAction(ids: string[]): Promise<void> {
  if (!Array.isArray(ids)) return
  const validos = ids.filter((id) => typeof id === "string" && UUID.test(id)).slice(0, 100)
  if (validos.length === 0) return
  const cpf = await cpfDoAssociado()
  if (!cpf) return
  const { marcados } = await marcarAvisosLidos(cpf, { ids: validos })
  if (marcados > 0) refresh()
}

/** A pessoa chegou por outro caminho à página de que o aviso falava (ex.: a notícia). */
export async function marcarAvisosDoLinkLidosAction(link: string): Promise<void> {
  if (typeof link !== "string" || !link.startsWith("/portal/") || link.length > 300) return
  const cpf = await cpfDoAssociado()
  if (!cpf) return
  const { marcados } = await marcarAvisosLidos(cpf, { link })
  if (marcados > 0) refresh()
}

export type EstadoMarcarTodos = { ok?: boolean; erro?: string }

export async function marcarTodosAvisosLidosAction(): Promise<EstadoMarcarTodos> {
  if ((await getVisualizacaoPortal())?.preview) {
    return { erro: "Na visualização pela gestão, só o próprio associado marca os avisos." }
  }
  const sessao = await getSessaoPortal()
  if (!sessao) return { erro: "Sessão expirada — entre de novo." }
  const { erro } = await marcarAvisosLidos(sessao.filiado.cpf)
  if (erro) return { erro }
  refresh()
  return { ok: true }
}
