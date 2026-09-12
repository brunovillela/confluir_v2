"use client"

import { useActionState } from "react"
import { ArrowRightLeft, Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"

import { cancelarReservaEquipeAction, remanejarAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-8 rounded-md border px-2 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function RemanejarForm({
  cupomId,
  quartoAtual,
  totalQuartos,
}: {
  cupomId: string
  quartoAtual: number
  totalQuartos: number
}) {
  const [estado, formAction, pendente] = useActionState(remanejarAction, {})
  const outros = Array.from({ length: totalQuartos }, (_, i) => i + 1).filter(
    (q) => q !== quartoAtual
  )
  if (outros.length === 0) return null

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="cupom_id" value={cupomId} />
      <select name="quarto" className={SELECT} defaultValue={outros[0]} aria-label="Quarto de destino">
        {outros.map((q) => (
          <option key={q} value={q}>
            Quarto {q}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="outline" className="h-8" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <ArrowRightLeft />}
        Remanejar
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      {estado.ok && <span className="text-success-fg text-xs">{estado.ok}</span>}
    </form>
  )
}

export function CancelarReservaEquipe({ cupomId }: { cupomId: string }) {
  const [estado, formAction, pendente] = useActionState(cancelarReservaEquipeAction, {})
  if (estado.ok) return <span className="text-success-fg text-xs">{estado.ok}</span>

  return (
    <form
      action={formAction}
      className="inline-flex items-center gap-2"
      onSubmit={(e) => {
        if (!confirm("Cancelar esta reserva? A vaga vai para a lista de espera.")) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="cupom_id" value={cupomId} />
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      <Button
        type="submit"
        size="sm"
        variant="ghost"
        className="text-destructive hover:text-destructive h-8"
        disabled={pendente}
      >
        {pendente ? <Loader2 className="animate-spin" /> : <X />}
        Cancelar reserva
      </Button>
    </form>
  )
}
