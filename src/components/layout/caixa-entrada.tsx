"use client"

import Link from "next/link"
import { ArrowRight, CircleCheck, Inbox } from "lucide-react"

import { usePendencias } from "@/components/layout/contadores-header"
import { Skeleton } from "@/components/ui/skeleton"
import type { PendenciasCarimbadas } from "@/lib/db/pendencias-carimbadas"
import { cn } from "@/lib/utils"

/**
 * Faixa do topo do painel: tudo que espera a pessoa agir, cada fila em um
 * bloco com a contagem e o link direto (onda 2, U1; visual do painel
 * unificado em 06/10/2026). Sem pendência, uma linha discreta — a ausência
 * também é informação. `estreita`: dividindo a linha com outro cartão
 * (Meu dia), cabe uma coluna a menos de filas. Lê do ContadoresProvider
 * (09/10/2026): atualiza junto com o contador do cabeçalho. Sem
 * `pendencias` (fallback do Suspense, enquanto a página calcula a lista),
 * mostra a do provedor ou, se nem ela chegou, um esqueleto.
 */
export function CaixaDeEntrada({
  pendencias: daPagina,
  estreita = false,
  className,
}: {
  pendencias?: PendenciasCarimbadas
  estreita?: boolean
  className?: string
}) {
  const pendencias = usePendencias(daPagina)
  const total = (pendencias ?? []).reduce((s, p) => s + p.quantidade, 0)
  const colunas = cn("grid gap-2 sm:grid-cols-2", estreita ? "xl:grid-cols-3" : "lg:grid-cols-3 xl:grid-cols-4")
  return (
    <section
      id="caixa-entrada"
      className={cn("hud-cartao min-w-0 scroll-mt-20 p-4", className)}
      aria-label="Caixa de entrada"
      aria-busy={pendencias === null || undefined}
    >
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Inbox className="text-primary size-4" />
          Sua caixa de entrada
        </h2>
        {total > 0 && (
          <span className="hud-numero hud-numero-destaque text-lg font-semibold">
            {total > 999 ? "999+" : total}
            <span className="text-muted-foreground ml-1 text-xs font-normal">
              {total === 1 ? "pendência" : "pendências"}
            </span>
          </span>
        )}
      </header>
      {pendencias === null ? (
        <div className={colunas}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      ) : pendencias.length === 0 ? (
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <CircleCheck className="text-success-fg size-4" />
          Nada esperando por você agora.
        </p>
      ) : (
        <ul className={colunas}>
          {pendencias.map((p) => (
            <li key={p.chave}>
              <Link
                href={p.href}
                className={cn(
                  "group bg-muted/40 hover:bg-muted flex h-full items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-colors",
                  "hover:border-primary/30"
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{p.titulo}</span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {p.descricao}
                    {p.antigas ? ` · ${p.antigas} paradas` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="hud-numero text-primary text-xl font-semibold">{p.quantidade}</span>
                  <ArrowRight className="text-muted-foreground size-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
