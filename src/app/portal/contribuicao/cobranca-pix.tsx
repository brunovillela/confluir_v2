"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

import { Button } from "@/components/ui/button"

/** O "copia e cola" do Pix com botão de copiar (o QR vem pronto do servidor). */
export function CopiaECola({ codigo }: { codigo: string }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(codigo)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2500)
    } catch {
      // sem clipboard: o texto fica selecionável abaixo
    }
  }
  return (
    <div className="grid gap-2">
      <Button type="button" onClick={copiar} className="min-h-11 w-full sm:w-auto">
        {copiado ? <Check /> : <Copy />}
        {copiado ? "Copiado!" : "Copiar código Pix"}
      </Button>
      <textarea readOnly value={codigo} rows={3} className="bg-muted/40 w-full rounded-md border p-2 font-mono text-[11px] leading-snug break-all" onFocus={(e) => e.currentTarget.select()} aria-label="Código Pix copia e cola" />
    </div>
  )
}
