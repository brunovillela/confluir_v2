"use client"

import { useEffect } from "react"

import { COOKIE_ORIGEM, DURACAO_ORIGEM_S } from "@/lib/oposicao-origem"

/**
 * Guarda a origem do link (?origem=qr…) num cookie, para a trilha saber de
 * onde a pessoa veio quando ela ler as instruções e registrar (15/11/2026).
 * Só a marca do canal — nada da pessoa. O último link usado vale.
 */
export function GuardarOrigem({ origem }: { origem: string }) {
  useEffect(() => {
    document.cookie = `${COOKIE_ORIGEM}=${encodeURIComponent(origem)}; path=/portal/oposicao; max-age=${DURACAO_ORIGEM_S}; samesite=lax`
  }, [origem])
  return null
}
