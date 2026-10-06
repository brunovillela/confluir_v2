import Link from "next/link"
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Peças do painel unificado (06/10/2026), no visual "HUD" de globals.css:
 * cartão de vidro com borda em gradiente, indicador com número mono e
 * sparkline com área em degradê. Servem a todas as abas do painel.
 */

type Icone = React.ComponentType<{ className?: string }>

/** Seção do painel: título pequeno em caixa-alta, ícone e atalho opcional. */
export function CartaoHud({
  titulo,
  descricao,
  icone: Icone,
  href,
  acao,
  className,
  children,
  id,
}: {
  titulo: string
  descricao?: string
  icone?: Icone
  href?: string
  acao?: React.ReactNode
  className?: string
  children: React.ReactNode
  id?: string
}) {
  return (
    <section id={id} className={cn("hud-cartao min-w-0 scroll-mt-20 p-4", className)}>
      <header className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            {Icone && <Icone className="text-primary size-4 shrink-0" />}
            <span className="truncate">{titulo}</span>
          </h2>
          {descricao && <p className="text-muted-foreground mt-0.5 text-xs">{descricao}</p>}
        </div>
        {acao}
        {href && !acao && (
          <Link
            href={href}
            className="text-muted-foreground hover:text-foreground inline-flex min-h-8 shrink-0 items-center gap-1 text-xs"
            aria-label={`Abrir ${titulo}`}
          >
            abrir
            <ArrowRight className="size-3.5" />
          </Link>
        )}
      </header>
      {children}
    </section>
  )
}

export type Delta = { texto: string; sinal: -1 | 0 | 1 } | null

/** Indicador: rótulo, número grande em mono, variação e sparkline. */
export function KpiHud({
  rotulo,
  valor,
  delta,
  deltaRotulo,
  subirEhBom = true,
  nota,
  sparkline,
  href,
  destaque = false,
  alerta = false,
}: {
  rotulo: string
  valor: string
  delta?: Delta
  deltaRotulo?: string
  subirEhBom?: boolean
  nota?: string
  sparkline?: number[]
  href?: string
  /** Número em degradê da marca (o indicador principal da faixa). */
  destaque?: boolean
  /** Número em vermelho (algo fora do esperado). */
  alerta?: boolean
}) {
  const bom = delta ? (delta.sinal === 0 ? null : (delta.sinal > 0) === subirEhBom) : null
  const Seta = delta ? (delta.sinal > 0 ? ArrowUpRight : delta.sinal < 0 ? ArrowDownRight : Minus) : null
  const corpo = (
    <>
      <p className="hud-rotulo truncate">{rotulo}</p>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <p
          className={cn(
            "hud-numero text-2xl leading-none font-semibold whitespace-nowrap",
            destaque && !alerta && "hud-numero-destaque",
            alerta && "text-destructive"
          )}
        >
          {valor}
        </p>
        {sparkline && sparkline.length > 1 && <Sparkline valores={sparkline} />}
      </div>
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
          <span className="hud-numero">{delta.texto}</span>
          {deltaRotulo && <span className="text-muted-foreground">{deltaRotulo}</span>}
        </p>
      )}
      {nota && <p className="text-muted-foreground mt-1.5 truncate text-xs">{nota}</p>}
    </>
  )
  return href ? (
    <Link href={href} className="hud-cartao block min-w-0 p-3.5">
      {corpo}
    </Link>
  ) : (
    <div className="hud-cartao min-w-0 p-3.5">{corpo}</div>
  )
}

function Sparkline({ valores }: { valores: number[] }) {
  const l = 84
  const a = 30
  const max = Math.max(...valores)
  const min = Math.min(...valores)
  const x = (i: number) => (i / (valores.length - 1)) * (l - 6) + 3
  const y = (v: number) => a - 3 - ((v - min) / (max - min || 1)) * (a - 6)
  const pontos = valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`)
  const ultimo = valores.length - 1
  const id = `sp-${valores.length}-${Math.round(valores[ultimo])}-${Math.round(max)}`
  return (
    <svg viewBox={`0 0 ${l} ${a}`} width={l} height={a} className="shrink-0 overflow-visible" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--graf-1)" stopOpacity={0.35} />
          <stop offset="100%" stopColor="var(--graf-1)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`M${x(0)},${a} L${pontos.join(" L")} L${x(ultimo)},${a} Z`} fill={`url(#${id})`} />
      <path
        d={`M${pontos.join(" L")}`}
        fill="none"
        stroke="var(--graf-1)"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
        style={{ filter: "drop-shadow(0 0 3px color-mix(in oklch, var(--primary) 50%, transparent))" }}
      />
      <circle cx={x(ultimo)} cy={y(valores[ultimo])} r={3} fill="var(--graf-1)" stroke="var(--card)" strokeWidth={1.5} />
    </svg>
  )
}

/** Barra fina de progresso com marca do "esperado". */
export function BarraHud({ pct, esperado, alerta = false }: { pct: number; esperado?: number; alerta?: boolean }) {
  return (
    <div className="bg-muted relative h-1.5 overflow-hidden rounded-full">
      <div
        className={cn("h-full rounded-full", alerta ? "bg-destructive" : "bg-primary")}
        style={{
          width: `${Math.max(0, Math.min(100, pct * 100))}%`,
          boxShadow: "0 0 8px color-mix(in oklch, var(--primary) 60%, transparent)",
        }}
      />
      {esperado !== undefined && (
        <div
          className="bg-foreground/60 absolute top-0 h-full w-0.5"
          style={{ left: `${Math.max(0, Math.min(100, esperado * 100))}%` }}
          title="Esperado até agora"
        />
      )}
    </div>
  )
}

/** Lista compacta dentro de um cartão (linhas divididas). */
export function ListaHud({ vazio, children }: { vazio: string; children: React.ReactNode[] }) {
  if (children.length === 0) return <p className="text-muted-foreground text-sm">{vazio}</p>
  return <ul className="divide-border/70 divide-y">{children}</ul>
}
