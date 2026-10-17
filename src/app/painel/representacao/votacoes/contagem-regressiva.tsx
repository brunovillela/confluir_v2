"use client"

import { useEffect, useState } from "react"
import { Timer } from "lucide-react"

import { cn } from "@/lib/utils"

function duracao(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const seg = s % 60
  if (d > 0) return `${d}d ${h}h ${String(m).padStart(2, "0")}min`
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}min ${String(seg).padStart(2, "0")}s`
  return `${m}min ${String(seg).padStart(2, "0")}s`
}

/**
 * Contagem regressiva da assembleia: até abrir, até terminar ou "encerrada".
 * Atualiza a cada segundo no navegador; o servidor manda só os instantes.
 */
export function ContagemRegressiva({
  inicio,
  fim,
  className,
  compacta,
}: {
  /** ISO da abertura (ou null). */
  inicio: string | null
  /** ISO do término (ou null). */
  fim: string | null
  className?: string
  /** Só o texto, sem o rótulo grande (para listas). */
  compacta?: boolean
}) {
  const [agora, setAgora] = useState<number | null>(null)
  useEffect(() => {
    const tique = () => setAgora(Date.now())
    tique()
    const t = setInterval(tique, 1000)
    return () => clearInterval(t)
  }, [])

  const ini = inicio ? Date.parse(inicio) : null
  const ter = fim ? Date.parse(fim) : null
  if (agora === null) return <span className={cn("text-muted-foreground text-sm", className)}>…</span>

  let rotulo: string
  let valor: string
  let tom: string
  if (ini !== null && agora < ini) {
    rotulo = "Abre em"
    valor = duracao(ini - agora)
    tom = "text-info-fg"
  } else if (ter !== null && agora < ter) {
    rotulo = "Termina em"
    valor = duracao(ter - agora)
    tom = ter - agora < 3600_000 ? "text-warning-fg" : "text-success-fg"
  } else if (ter !== null) {
    rotulo = "Encerrada"
    valor = ""
    tom = "text-muted-foreground"
  } else {
    rotulo = "Sem término definido"
    valor = ""
    tom = "text-muted-foreground"
  }

  if (compacta) {
    return (
      <span className={cn("text-xs tabular-nums", tom, className)}>
        {rotulo}
        {valor ? ` ${valor}` : ""}
      </span>
    )
  }
  return (
    <div className={cn("grid gap-0.5", className)} aria-live="off">
      <span className="text-muted-foreground flex items-center gap-1 text-xs">
        <Timer className="size-3.5" />
        {rotulo}
      </span>
      {valor && <span className={cn("text-2xl leading-none font-semibold tabular-nums", tom)}>{valor}</span>}
    </div>
  )
}
