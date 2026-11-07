"use client"

import { useState } from "react"
import { Check, Copy, ExternalLink } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * O endereço da ficha online, à vista, com Copiar e Abrir. Se o navegador
 * bloquear a área de transferência, o endereço fica selecionado para copiar
 * à mão.
 */
export function EnderecoFicha({ endereco, compacto = false }: { endereco: string; compacto?: boolean }) {
  const [copiado, setCopiado] = useState(false)
  const [manual, setManual] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(endereco)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      setManual(true)
    }
  }

  // No topo de Filiados: só os dois botões, o endereço vai no título do link.
  if (compacto) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" asChild>
          <a href={endereco} target="_blank" rel="noreferrer" title={endereco}>
            <ExternalLink />
            Ficha de filiação online
          </a>
        </Button>
        <Button type="button" variant="outline" size="icon" onClick={copiar} aria-label="Copiar link da ficha de filiação online" title={copiado ? "Copiado" : "Copiar link"}>
          {copiado ? <Check /> : <Copy />}
        </Button>
        {manual && <span className="text-muted-foreground w-full text-xs">Copie à mão: {endereco}</span>}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        readOnly
        value={endereco}
        aria-label="Endereço da ficha de filiação online"
        onFocus={(e) => e.currentTarget.select()}
        autoFocus={manual}
        className="border-input bg-muted/40 h-9 min-w-0 flex-1 basis-64 rounded-md border px-3 font-mono text-sm outline-none"
      />
      <Button type="button" size="sm" onClick={copiar}>
        {copiado ? <Check /> : <Copy />}
        {copiado ? "Copiado" : "Copiar link da ficha online"}
      </Button>
      <Button variant="outline" size="sm" asChild>
        <a href={endereco} target="_blank" rel="noreferrer">
          <ExternalLink />
          Abrir
        </a>
      </Button>
      {manual && <p className="text-muted-foreground w-full text-xs">O navegador não deixou copiar: o endereço está selecionado, use Ctrl+C.</p>}
    </div>
  )
}
