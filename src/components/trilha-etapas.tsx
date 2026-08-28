import { Check } from "lucide-react"

import { formatarData } from "@/lib/formato"
import type { MarcoTrilha } from "@/lib/filiacao"
import { cn } from "@/lib/utils"

/**
 * Gráfico de etapas estilo logística ("linha do pedido"): uma linha horizontal
 * com marcos que vão sendo preenchidos conforme o processo avança. Puramente
 * derivado da condição (ver marcosDaTrilha em lib/filiacao.ts) — sem estado.
 */
export function TrilhaEtapas({ marcos }: { marcos: MarcoTrilha[] }) {
  return (
    <ol className="flex items-start">
      {marcos.map((m, i) => {
        const ultimo = i === marcos.length - 1
        // Segmento preenchido quando o marco que ele "chega" já foi alcançado.
        const linhaEsq = m.estado !== "pendente"
        const linhaDir = !ultimo && marcos[i + 1].estado !== "pendente"
        return (
          <li
            key={i}
            className="flex min-w-0 flex-1 flex-col items-center text-center"
          >
            <div className="flex w-full items-center">
              <span
                className={cn(
                  "h-0.5 flex-1 rounded-full",
                  i === 0 ? "opacity-0" : linhaEsq ? "bg-primary" : "bg-border"
                )}
              />
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-medium tabular-nums",
                  m.estado === "concluido" &&
                    "border-primary bg-primary text-primary-foreground",
                  m.estado === "atual" &&
                    "border-primary text-primary ring-primary/15 ring-4",
                  m.estado === "pendente" &&
                    "border-border text-muted-foreground"
                )}
              >
                {m.estado === "concluido" ? (
                  <Check className="size-3.5" />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  "h-0.5 flex-1 rounded-full",
                  ultimo ? "opacity-0" : linhaDir ? "bg-primary" : "bg-border"
                )}
              />
            </div>
            <span
              className={cn(
                "mt-1.5 px-1 text-xs leading-tight break-words",
                m.estado === "pendente"
                  ? "text-muted-foreground"
                  : "text-foreground font-medium"
              )}
            >
              {m.rotulo}
            </span>
            {m.data && (
              <span className="text-muted-foreground text-[11px] tabular-nums">
                {formatarData(m.data)}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
