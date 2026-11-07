"use client"

import { useRef, useState } from "react"

import { tipoPelaJustificativa, type TipoReembolso } from "@/lib/reembolsos-tipos"

/**
 * Sugere o tipo do reembolso pela justificativa digitada (07/11/2026), com a
 * mesma classificação do histórico. Só preenche enquanto ninguém escolheu o
 * tipo à mão: o tipo vazio (ou o que a própria sugestão pôs) acompanha o
 * texto; escolher no seletor encerra a sugestão. "Outro" nunca é sugerido —
 * aí o seletor volta a pedir a escolha.
 */
export function useTipoSugerido() {
  const tipoRef = useRef<HTMLSelectElement>(null)
  const sugerindo = useRef(false)
  const [sugerido, setSugerido] = useState<TipoReembolso | null>(null)

  function aoDigitarJustificativa(texto: string) {
    const sel = tipoRef.current
    if (!sel || (sel.value !== "" && !sugerindo.current)) return
    const tipo = tipoPelaJustificativa(texto)
    if (tipo !== "outro") {
      sel.value = tipo
      sugerindo.current = true
      setSugerido(tipo)
    } else if (sugerindo.current) {
      sel.value = ""
      sugerindo.current = false
      setSugerido(null)
    }
  }

  function aoEscolherTipo() {
    sugerindo.current = false
    setSugerido(null)
  }

  return { tipoRef, sugerido, aoDigitarJustificativa, aoEscolherTipo }
}
