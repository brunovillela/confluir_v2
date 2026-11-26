"use client"

import { useEffect } from "react"

/**
 * Abre a seção recolhida (<details>) do extrato quando se chega a ela por
 * âncora — os cartões do resumo levam a #futuros, que nasce retraído (26/11/2026).
 */
export function AbrirSecaoPorAncora() {
  useEffect(() => {
    const abrir = (hash: string) => {
      if (!hash || hash.length < 2) return
      const alvo = document.getElementById(decodeURIComponent(hash.slice(1)))
      if (alvo instanceof HTMLDetailsElement) alvo.open = true
    }
    abrir(window.location.hash)
    const aoClicar = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[href^="#"]')
      if (a) abrir(a.getAttribute("href") ?? "")
    }
    const aoMudar = () => abrir(window.location.hash)
    document.addEventListener("click", aoClicar)
    window.addEventListener("hashchange", aoMudar)
    return () => {
      document.removeEventListener("click", aoClicar)
      window.removeEventListener("hashchange", aoMudar)
    }
  }, [])
  return null
}
