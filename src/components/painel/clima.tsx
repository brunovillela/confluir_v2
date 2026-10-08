"use client"

import { useEffect, useState } from "react"
import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Moon,
  Sun,
} from "lucide-react"

import type { ClimaCidade } from "@/lib/db/clima"
import { cn } from "@/lib/utils"

type Icone = React.ComponentType<{ className?: string }>

/** Código WMO do Open-Meteo → descrição curta e ícone. */
function tempo(codigo: number, dia: boolean): { texto: string; Icone: Icone } {
  if (codigo === 0) return { texto: "Céu limpo", Icone: dia ? Sun : Moon }
  if (codigo <= 2) return { texto: "Poucas nuvens", Icone: dia ? CloudSun : CloudMoon }
  if (codigo === 3) return { texto: "Nublado", Icone: Cloud }
  if (codigo <= 48) return { texto: "Neblina", Icone: CloudFog }
  if (codigo <= 57) return { texto: "Garoa", Icone: CloudDrizzle }
  if (codigo <= 67 || (codigo >= 80 && codigo <= 82)) return { texto: codigo >= 80 ? "Pancadas de chuva" : "Chuva", Icone: CloudRain }
  if (codigo <= 77 || codigo === 85 || codigo === 86) return { texto: "Neve", Icone: CloudSnow }
  return { texto: "Trovoadas", Icone: CloudLightning }
}

const grau = (v: number | null) => (v === null ? "—" : `${Math.round(v)}°`)

/**
 * Tempo agora nas cidades das sedes, alternando a cada 8 s (pausa ao passar
 * o mouse). Fica no cabeçalho do painel, à direita da saudação, numa linha:
 * ícone e temperatura, cidade e condição, mínima/máxima e chance de chuva.
 */
export function ClimaSedes({ cidades, className }: { cidades: ClimaCidade[]; className?: string }) {
  const [i, setI] = useState(0)
  const [pausado, setPausado] = useState(false)

  useEffect(() => {
    if (cidades.length < 2 || pausado) return
    const t = setInterval(() => setI((n) => (n + 1) % cidades.length), 8000)
    return () => clearInterval(t)
  }, [cidades.length, pausado])

  if (cidades.length === 0) return null
  const c = cidades[i % cidades.length]
  const { texto, Icone } = tempo(c.codigo, c.dia)

  return (
    <div
      className={cn("hud-cartao flex items-center gap-3 px-3 py-2", className)}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      aria-live="polite"
      aria-label="Tempo agora"
    >
      <div className="flex shrink-0 items-center gap-1.5">
        <Icone className="text-primary size-6 drop-shadow-[0_0_6px_var(--primary)]" />
        <span className="hud-numero hud-numero-destaque text-2xl leading-none font-semibold">{grau(c.temperatura)}</span>
      </div>
      <div className="min-w-0 leading-tight">
        <p className="truncate text-sm font-semibold">
          {c.cidade}
          {c.uf ? <span className="text-muted-foreground font-normal">/{c.uf}</span> : null}
        </p>
        <p className="text-muted-foreground flex items-center gap-1.5 truncate text-xs">
          <span>{texto}</span>
          <span className="hud-numero">
            · {grau(c.minima)}/{grau(c.maxima)}
          </span>
          {c.chuva !== null && (
            <span className="hud-numero flex items-center gap-0.5">
              · <Droplets className="size-3" />
              {c.chuva}%
            </span>
          )}
        </p>
      </div>
      {cidades.length > 1 && (
        <div className="flex shrink-0 flex-col gap-1">
          {cidades.map((x, k) => (
            <button
              key={`${x.cidade}-${x.uf}`}
              type="button"
              onClick={() => setI(k)}
              aria-label={`Ver ${x.cidade}`}
              aria-current={k === i % cidades.length}
              className={cn(
                "w-1.5 rounded-full transition-all",
                k === i % cidades.length ? "bg-primary h-3 shadow-[0_0_8px_var(--primary)]" : "bg-muted-foreground/30 h-1.5"
              )}
            />
          ))}
        </div>
      )}
    </div>
  )
}
