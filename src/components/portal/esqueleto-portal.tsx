"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

import { useDentroDaCasca } from "./contador-avisos"

/**
 * Esqueleto das páginas do portal (A65), no molde do EsqueletoHub do painel:
 * título, três cartões e um bloco. Dentro da casca ocupa o <main> (menu,
 * cabeçalho e barra inferior continuam na tela); fora dela — tela de entrada
 * e Oposição do trabalhador não filiado — vem numa coluna estreita como a
 * dessas páginas.
 */
export function EsqueletoPortal() {
  const dentro = useDentroDaCasca()
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn("flex flex-col gap-6", !dentro && "mx-auto w-full max-w-2xl px-4 py-8")}
    >
      <span className="sr-only">Carregando…</span>
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-3.5 w-72 max-w-full" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
