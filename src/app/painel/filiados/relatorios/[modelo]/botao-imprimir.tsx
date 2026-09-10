"use client"

import { Printer } from "lucide-react"

import { Button } from "@/components/ui/button"

/** Imprime a página do relatório (ou salva como PDF). Some na impressão. */
export function BotaoImprimir() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()} className="print:hidden">
      <Printer />
      Imprimir
    </Button>
  )
}
