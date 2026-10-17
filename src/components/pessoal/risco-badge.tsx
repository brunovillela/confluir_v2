import type { NivelRisco } from "@/lib/pessoal-sst-constantes"

/** Nível de risco (matriz 5×5) com a cor da faixa — Trivial a Intolerável. */
export function RiscoBadge({ nivel }: { nivel: NivelRisco | null }) {
  if (!nivel) return <span className="text-muted-foreground text-xs">—</span>
  return (
    <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
      <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: nivel.cor }} aria-hidden />
      {nivel.rotulo} ({nivel.valor})
    </span>
  )
}
