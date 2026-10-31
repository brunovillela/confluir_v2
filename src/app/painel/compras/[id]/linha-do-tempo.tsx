import { Check } from "lucide-react"

export type EtapaProcesso = {
  titulo: string
  feita: boolean
  /** Ex.: "2 de 3 ordens pagas", "em 06/10/2026". */
  detalhe?: string | null
}

/**
 * Faixa no topo do processo de compra (onda 2 do plano do RPA): as etapas da
 * solicitação ao recebimento, com a atual destacada — a primeira não feita —
 * para ver de relance onde o processo está parado.
 */
export function LinhaDoTempoProcesso({ etapas, cancelado }: { etapas: EtapaProcesso[]; cancelado: boolean }) {
  const atual = cancelado ? -1 : etapas.findIndex((e) => !e.feita)
  return (
    <ol
      aria-label="Etapas do processo"
      className="bg-card grid gap-x-2 gap-y-3 rounded-xl border p-3 sm:grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))]"
    >
      {etapas.map((e, i) => {
        const ehAtual = i === atual
        return (
          <li key={e.titulo} className="flex min-w-0 items-start gap-2" aria-current={ehAtual ? "step" : undefined}>
            <span
              className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border text-[0.65rem] font-semibold ${
                e.feita
                  ? "border-success bg-success text-white"
                  : ehAtual
                    ? "border-primary text-primary ring-primary/25 ring-2"
                    : "text-muted-foreground"
              }`}
            >
              {e.feita ? <Check className="size-3" /> : i + 1}
            </span>
            <span className="min-w-0">
              <span
                className={`block text-sm leading-tight ${ehAtual ? "text-primary font-semibold" : e.feita ? "font-medium" : "text-muted-foreground"}`}
              >
                {e.titulo}
              </span>
              {e.detalhe && <span className="text-muted-foreground block text-xs">{e.detalhe}</span>}
            </span>
          </li>
        )
      })}
      {cancelado && (
        <li className="text-destructive text-sm font-medium sm:col-span-full">Processo cancelado</li>
      )}
    </ol>
  )
}
