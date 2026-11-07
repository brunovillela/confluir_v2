"use client"

import { useState } from "react"
import { Check, Copy } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

/**
 * Texto pronto para copiar (kit de divulgação da oposição). Fica num campo
 * editável: dá para ajustar antes de copiar. Se o navegador bloquear a área
 * de transferência, o texto fica selecionado para copiar à mão.
 */
export function CopiarTexto({ id, rotulo, texto, linhas = 8 }: { id: string; rotulo: string; texto: string; linhas?: number }) {
  const [valor, setValor] = useState(texto)
  const [copiado, setCopiado] = useState(false)
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {rotulo}
      </label>
      <Textarea id={id} rows={linhas} value={valor} onChange={(e) => setValor(e.target.value)} />
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(valor)
              setCopiado(true)
              setTimeout(() => setCopiado(false), 2500)
            } catch {
              const campo = document.getElementById(id) as HTMLTextAreaElement | null
              campo?.focus()
              campo?.select()
            }
          }}
        >
          {copiado ? <Check /> : <Copy />}
          {copiado ? "Copiado" : "Copiar"}
        </Button>
      </div>
    </div>
  )
}
