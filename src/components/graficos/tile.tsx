import Link from "next/link"
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * Stat tile (skill dataviz): rótulo, valor grande em figuras proporcionais,
 * delta assinado contra um período nomeado (cor = direção × se subir é bom)
 * e, opcionalmente, uma sparkline de 12 pontos na cor de de-ênfase com o
 * período atual no acento. Server-safe.
 */
export function TileIndicador({
  rotulo,
  valor,
  delta,
  deltaRotulo,
  subirEhBom = true,
  sparkline,
  href,
  nota,
}: {
  rotulo: string
  valor: string
  /** Variação já formatada (ex.: "+3,2%" ou "−12"); sem ela, não mostra. */
  delta?: { texto: string; sinal: -1 | 0 | 1 } | null
  deltaRotulo?: string
  subirEhBom?: boolean
  sparkline?: number[]
  href?: string
  /** Texto curto de contexto (ex.: "regra não configurada"). */
  nota?: string
}) {
  const bom = delta ? (delta.sinal === 0 ? null : (delta.sinal > 0) === subirEhBom) : null
  const Seta = delta ? (delta.sinal > 0 ? ArrowUpRight : delta.sinal < 0 ? ArrowDownRight : Minus) : null
  const corpo = (
    <CardContent className="flex items-end justify-between gap-3 py-4">
      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{rotulo}</p>
        <p className="mt-1 text-2xl leading-none font-semibold whitespace-nowrap">{valor}</p>
        {delta && Seta && (
          <p
            className={cn(
              "mt-1.5 flex items-center gap-1 text-xs",
              bom === true && "text-success-fg",
              bom === false && "text-destructive",
              bom === null && "text-muted-foreground"
            )}
          >
            <Seta className="size-3.5" />
            {delta.texto}
            {deltaRotulo && <span className="text-muted-foreground">{deltaRotulo}</span>}
          </p>
        )}
        {nota && <p className="text-muted-foreground mt-1.5 text-xs">{nota}</p>}
      </div>
      {sparkline && sparkline.length > 1 && <Sparkline valores={sparkline} />}
    </CardContent>
  )
  const card = <Card className={cn(href && "group-hover:border-primary/40 transition-colors")}>{corpo}</Card>
  return href ? (
    <Link href={href} className="group block">
      {card}
    </Link>
  ) : (
    card
  )
}

function Sparkline({ valores }: { valores: number[] }) {
  const l = 96
  const a = 32
  const max = Math.max(...valores, 1)
  const min = Math.min(...valores, 0)
  const x = (i: number) => (i / (valores.length - 1)) * (l - 4) + 2
  const y = (v: number) => a - 2 - ((v - min) / (max - min || 1)) * (a - 4)
  const pontos = valores.map((v, i) => `${x(i)},${y(v)}`).join(" L")
  const ultimo = valores.length - 1
  return (
    <svg viewBox={`0 0 ${l} ${a}`} width={l} height={a} className="shrink-0" aria-hidden>
      <path d={`M${pontos}`} fill="none" stroke="var(--graf-outros)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(ultimo)} cy={y(valores[ultimo])} r={3.5} fill="var(--graf-1)" stroke="var(--card)" strokeWidth={2} />
    </svg>
  )
}
