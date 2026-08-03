"use client"

import { Printer } from "lucide-react"

/** Botão que dispara a impressão do navegador (salvar como PDF). Some na impressão. */
export function BotaoImprimir() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="oficio-sem-impressao inline-flex items-center gap-2 rounded-md bg-neutral-800 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-700"
    >
      <Printer className="size-4" />
      Imprimir / salvar como PDF
    </button>
  )
}
