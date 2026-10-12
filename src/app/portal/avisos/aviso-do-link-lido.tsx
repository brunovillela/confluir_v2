"use client"

import { useEffect } from "react"

import { marcarAvisosDoLinkLidosAction } from "./actions"

/**
 * Montado numa página a que um aviso leva (a notícia, por exemplo): quem
 * chega por outro caminho que não o sino também dá o aviso por lido (A100),
 * e o selo do sino acompanha. Não desenha nada. Na visualização pela gestão,
 * não monte — a action também recusa.
 */
export function AvisoDoLinkLido({ link }: { link: string }) {
  useEffect(() => {
    marcarAvisosDoLinkLidosAction(link).catch(() => {})
  }, [link])
  return null
}
