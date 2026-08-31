"use client"

import { useEffect, useState } from "react"
import { Clock } from "lucide-react"

import {
  dentroDaJornada,
  type JornadaDia,
} from "@/lib/pessoal-sst-constantes"

/**
 * Faixa fixa exibida quando o funcionário usa o sistema FORA do horário da
 * jornada contratada (cadastrada em Pessoal › Atribuições › Jornadas). Sem
 * jornada cadastrada, nada é exibido. Reavalia a cada minuto, no fuso de
 * São Paulo (o horário contratado é local, não o do navegador).
 */
export function AlertaForaJornada({ dias }: { dias: JornadaDia[] }) {
  const [fora, setFora] = useState(false)

  useEffect(() => {
    if (dias.length === 0) return
    const avaliar = () => {
      const agora = new Date()
      const partes = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Sao_Paulo",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(agora)
      const get = (t: string) => partes.find((p) => p.type === t)?.value ?? ""
      const DIA: Record<string, number> = {
        Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
      }
      const dia = DIA[get("weekday")]
      const minutos = Number(get("hour")) * 60 + Number(get("minute"))
      if (dia === undefined || Number.isNaN(minutos)) return
      const dentro = dentroDaJornada(dias, dia, minutos)
      // null = dia sem expediente → também é "fora do horário"
      setFora(dentro !== true)
    }
    avaliar()
    const timer = setInterval(avaliar, 60_000)
    return () => clearInterval(timer)
  }, [dias])

  if (!fora) return null

  return (
    <div
      role="status"
      className="border-warning/40 bg-warning/15 text-warning-fg sticky top-0 z-40 flex items-center gap-2 border-b px-4 py-2 text-sm"
    >
      <Clock className="size-4 shrink-0" />
      <span>
        Você está acessando o sistema <strong>fora do seu horário de
        trabalho</strong>. Horas fora da jornada contratada podem gerar passivo
        trabalhista — combine com a gestão antes de trabalhar agora.
      </span>
    </div>
  )
}
