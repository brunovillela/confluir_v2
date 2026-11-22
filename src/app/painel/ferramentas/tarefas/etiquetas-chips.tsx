import { CLASSES_COR_ETIQUETA, type CorEtiqueta } from "@/lib/nucleo-constantes"
import { cn } from "@/lib/utils"

/** Os chips coloridos das etiquetas de uma tarefa. */
export function EtiquetasChips({
  etiquetas,
  className,
}: {
  etiquetas: { id: string; nome: string; cor: CorEtiqueta }[]
  className?: string
}) {
  if (!etiquetas.length) return null
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {etiquetas.map((e) => (
        <span key={e.id} className={cn("rounded px-1.5 py-0.5 text-[10px] leading-none font-medium", CLASSES_COR_ETIQUETA[e.cor])}>
          {e.nome}
        </span>
      ))}
    </span>
  )
}
