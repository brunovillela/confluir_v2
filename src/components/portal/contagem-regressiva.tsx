"use client"

import { useEffect, useState } from "react"

/**
 * Contagem regressiva até um instante (ISO). Atualiza a cada segundo. Usada no
 * banner de assembleia online da área do filiado. Sem hidratação divergente:
 * só calcula depois de montar (o servidor renderiza o rótulo estático).
 */
export function ContagemRegressiva({
  ate,
  className,
}: {
  ate: string
  className?: string
}) {
  const [restante, setRestante] = useState<number | null>(null)

  useEffect(() => {
    const fim = new Date(ate).getTime()
    const tick = () => setRestante(Math.max(0, fim - Date.now()))
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [ate])

  if (restante === null) return <span className={className}>calculando…</span>
  if (restante <= 0) return <span className={className}>encerrada</span>

  const s = Math.floor(restante / 1000)
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  const seg = s % 60
  const partes = d > 0 ? [`${d}d`, `${h}h`, `${m}m`] : [`${h}h`, `${m}m`, `${seg}s`]

  return (
    <span className={className}>
      encerra em{" "}
      <span className="tabular-nums font-semibold">{partes.join(" ")}</span>
    </span>
  )
}
