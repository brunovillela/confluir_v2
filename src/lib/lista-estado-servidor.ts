import "server-only"

import { headers } from "next/headers"

import { recorteDaLista, urlNaLista } from "@/lib/lista-estado"

/**
 * Destino do redirect de uma action que volta para a lista de onde veio,
 * mantendo o recorte (página, itens por página, filtros, aba) que o usuário
 * tinha. O recorte vem do Referer, enviado pelo navegador nos POSTs da própria
 * origem (Referrer-Policy strict-origin-when-cross-origin, em next.config.ts):
 * só vale quando a página de origem é o próprio `caminho`. Sem Referer, volta
 * a `caminho` como antes.
 *
 * `ancora` (ex.: `registro-<id>`) faz a tela voltar na linha, não no topo.
 */
export async function voltarNaLista(
  caminho: string,
  extras: Record<string, string | null | undefined> | string = {},
  ancora?: string
): Promise<string> {
  let recorte = new URLSearchParams()
  try {
    const referer = (await headers()).get("referer")
    if (referer) {
      const origem = new URL(referer)
      if (origem.pathname === caminho) recorte = recorteDaLista(origem.searchParams)
    }
  } catch {
    // Referer ausente ou inválido: volta sem recorte.
  }
  return urlNaLista(caminho, recorte, extras, ancora)
}
