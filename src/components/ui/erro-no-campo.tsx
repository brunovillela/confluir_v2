"use client"

import { useEffect, useRef } from "react"

/**
 * ERRO POR CAMPO (onda 2, U5). A action devolve `{ erro, campo }` — `campo` é
 * o `name` do input que falhou. Este componente, colocado UMA vez dentro do
 * formulário, leva a pessoa ao campo: marca `aria-invalid` (borda vermelha),
 * rola até ele, foca e escreve a mensagem logo abaixo. Sem `campo`, não faz
 * nada — o aviso geral do formulário continua valendo.
 *
 * Mexe no DOM de propósito (um <p> depois do campo), para servir a qualquer
 * formulário sem reescrever cada input; desfaz tudo quando o estado muda.
 */
export function ErroNoCampo({ estado }: { estado: { erro?: string; campo?: string } }) {
  const marcador = useRef<HTMLSpanElement>(null)
  const { erro, campo } = estado

  useEffect(() => {
    if (!erro || !campo) return
    const form = marcador.current?.closest("form")
    const alvo = form?.elements.namedItem(campo)
    const el = alvo instanceof RadioNodeList ? (alvo[0] as HTMLElement | undefined) : (alvo as HTMLElement | null)
    if (!el) return

    // Campo escondido (ex.: busca com input oculto): marca o irmão visível.
    const visivel = el instanceof HTMLInputElement && el.type === "hidden" ? (el.parentElement ?? el) : el
    visivel.setAttribute("aria-invalid", "true")
    const p = document.createElement("p")
    p.setAttribute("role", "alert")
    p.className = "text-destructive mt-1 text-xs"
    p.textContent = erro
    visivel.insertAdjacentElement("afterend", p)
    visivel.scrollIntoView({ block: "center", behavior: "smooth" })
    if (typeof (visivel as HTMLElement).focus === "function") (visivel as HTMLElement).focus({ preventScroll: true })

    return () => {
      visivel.removeAttribute("aria-invalid")
      p.remove()
    }
  }, [erro, campo])

  return <span ref={marcador} hidden />
}
