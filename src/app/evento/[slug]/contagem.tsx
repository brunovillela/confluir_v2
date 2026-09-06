"use client"

import { useEffect, useState } from "react"

/**
 * Contagem regressiva até o evento.
 *
 * Renderiza NADA no primeiro passe e só liga depois de montar: se o servidor
 * desenhasse um valor, ele já chegaria errado ao navegador (o tempo passou no
 * caminho) e o React acusaria divergência de hidratação.
 */
function partes(ms: number) {
  const seg = Math.max(0, Math.floor(ms / 1000))
  return {
    dias: Math.floor(seg / 86400),
    horas: Math.floor((seg % 86400) / 3600),
    minutos: Math.floor((seg % 3600) / 60),
    segundos: seg % 60,
  }
}

function Bloco({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="flex min-w-16 flex-col items-center rounded-md border px-3 py-2">
      <span className="text-2xl font-semibold tabular-nums">
        {String(valor).padStart(2, "0")}
      </span>
      <span className="text-muted-foreground text-[11px] uppercase tracking-wide">
        {rotulo}
      </span>
    </div>
  )
}

export function ContagemRegressiva({ inicioIso }: { inicioIso: string }) {
  const [restante, setRestante] = useState<number | null>(null)

  useEffect(() => {
    const alvo = new Date(inicioIso).getTime()
    const tick = () => setRestante(alvo - Date.now())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [inicioIso])

  if (restante === null) return null

  if (restante <= 0) {
    return (
      <p className="text-muted-foreground text-sm">
        O evento já começou.
      </p>
    )
  }

  const p = partes(restante)
  return (
    <div className="flex flex-wrap justify-center gap-2">
      <Bloco valor={p.dias} rotulo={p.dias === 1 ? "dia" : "dias"} />
      <Bloco valor={p.horas} rotulo="horas" />
      <Bloco valor={p.minutos} rotulo="min" />
      <Bloco valor={p.segundos} rotulo="seg" />
    </div>
  )
}
