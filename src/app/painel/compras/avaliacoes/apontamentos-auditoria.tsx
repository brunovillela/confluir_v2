import { TriangleAlert } from "lucide-react"

import type { ApontamentoDaOrdem } from "@/lib/db/ordens-verificacao"

/**
 * Os alertas da auditoria de uma ordem, abertos pelo avaliador: o selo mostra
 * quantos são e, clicado, do que se tratam (regra, detalhe e se quem lançou
 * viu e confirmou sem ajustar).
 */
export function ApontamentosAuditoria({ apontamentos }: { apontamentos: ApontamentoDaOrdem[] }) {
  if (apontamentos.length === 0) return null
  const n = apontamentos.length
  return (
    <details className="group mt-1.5 w-full">
      <summary className="border-warning/50 text-warning-fg inline-flex cursor-pointer list-none items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium select-none [&::-webkit-details-marker]:hidden">
        <TriangleAlert className="size-3.5" />
        {n} alerta{n === 1 ? "" : "s"} da auditoria
        <span className="text-muted-foreground font-normal group-open:hidden">— ver</span>
        <span className="text-muted-foreground hidden font-normal group-open:inline">— ocultar</span>
      </summary>
      <ul className="border-warning/40 bg-warning/5 mt-2 grid gap-2 rounded-md border p-3 text-xs">
        {apontamentos.map((a) => (
          <li key={a.codigo} className="grid gap-0.5">
            <span className="font-medium">{a.titulo}</span>
            {a.detalhe && <span className="text-muted-foreground">{a.detalhe}</span>}
            {a.confirmado && (
              <span className="text-muted-foreground italic">
                Quem lançou viu este alerta e confirmou sem ajustar.
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  )
}
