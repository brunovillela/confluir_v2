"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Painel "o sistema está trabalhando" (importações do Pessoal): ícone
 * girando, barra (com o progresso, quando se sabe) e o tempo decorrido — a
 * leitura pela IA leva minutos, e sem isso a tela parecia parada.
 */
export function Trabalhando({
  titulo,
  detalhe,
  progresso,
  className,
}: {
  titulo: string
  detalhe?: string
  /** 0–100; sem ele, a barra pulsa (duração desconhecida). */
  progresso?: number
  className?: string
}) {
  const [segundos, setSegundos] = useState(0)
  useEffect(() => {
    const t = window.setInterval(() => setSegundos((s) => s + 1), 1000)
    return () => window.clearInterval(t)
  }, [])
  const decorrido = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`

  return (
    <div role="status" aria-live="polite" className={cn("border-info/40 bg-info/5 grid gap-2 rounded-lg border p-4", className)}>
      <div className="flex items-start gap-3">
        <Loader2 className="text-info-fg mt-0.5 size-5 shrink-0 animate-spin" />
        <div className="grid flex-1 gap-0.5">
          <span className="text-sm font-medium">{titulo}</span>
          {detalhe && <span className="text-muted-foreground text-xs">{detalhe}</span>}
        </div>
        <span className="text-muted-foreground text-xs tabular-nums">{decorrido}</span>
      </div>
      <div className="bg-muted relative h-1.5 overflow-hidden rounded-full">
        <div
          className="bg-primary absolute inset-y-0 left-0 animate-pulse rounded-full transition-[width] duration-700"
          // Sem progresso conhecido, a barra cheia pulsa; com ele, nunca fica
          // vazia — o primeiro lote também está em andamento.
          style={{ width: `${progresso === undefined ? 100 : Math.max(progresso, 6)}%` }}
        />
      </div>
    </div>
  )
}
