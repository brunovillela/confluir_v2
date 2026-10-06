"use client"

import { Children, useEffect, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * Slides do painel: rolagem horizontal com encaixe (scroll-snap), setas e
 * pontos. `colunas` = quantos slides cabem lado a lado a partir de 768px
 * (no celular é sempre um). Sem autoplay — quem lê decide quando passar.
 */
export function Carrossel({
  colunas = 1,
  rotulo,
  children,
}: {
  colunas?: 1 | 2 | 3
  rotulo: string
  children: React.ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const total = Children.count(children)
  const [atual, setAtual] = useState(0)
  const [porTela, setPorTela] = useState(1)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => {
      const primeiro = el.firstElementChild as HTMLElement | null
      const largura = primeiro?.offsetWidth ?? el.clientWidth
      setPorTela(Math.max(1, Math.round(el.clientWidth / (largura || 1))))
      setAtual(Math.round(el.scrollLeft / ((largura || 1) + 16)))
    }
    medir()
    el.addEventListener("scroll", medir, { passive: true })
    window.addEventListener("resize", medir)
    return () => {
      el.removeEventListener("scroll", medir)
      window.removeEventListener("resize", medir)
    }
  }, [])

  const paginas = Math.max(1, total - porTela + 1)
  const ir = (i: number) => {
    const el = ref.current
    const alvo = el?.children[Math.max(0, Math.min(total - 1, i))] as HTMLElement | undefined
    if (el && alvo) el.scrollTo({ left: alvo.offsetLeft - el.offsetLeft, behavior: "smooth" })
  }

  return (
    <div className="grid gap-2" role="region" aria-roledescription="carrossel" aria-label={rotulo}>
      <div ref={ref} className="hud-carrossel" data-colunas={colunas}>
        {children}
      </div>
      {paginas > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => ir(atual - 1)}
            disabled={atual === 0}
            className="text-muted-foreground hover:text-foreground rounded-md p-1 disabled:opacity-30"
            aria-label="Anterior"
          >
            <ChevronLeft className="size-4" />
          </button>
          {Array.from({ length: paginas }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => ir(i)}
              aria-label={`Ir para ${i + 1}`}
              aria-current={i === atual}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === atual ? "bg-primary w-5 shadow-[0_0_8px_var(--primary)]" : "bg-muted-foreground/30 w-1.5"
              )}
            />
          ))}
          <button
            type="button"
            onClick={() => ir(atual + 1)}
            disabled={atual >= paginas - 1}
            className="text-muted-foreground hover:text-foreground rounded-md p-1 disabled:opacity-30"
            aria-label="Próximo"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}
