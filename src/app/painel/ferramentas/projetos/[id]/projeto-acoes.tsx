"use client"

import { useActionState } from "react"
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"

import { alternarFinalizadoAction } from "../actions"

/** Botão do editor: finalizar / reabrir o projeto. */
export function ProjetoAcoes({
  projetoId,
  finalizado,
}: {
  projetoId: string
  finalizado: boolean
}) {
  const [estado, acao, pendente] = useActionState(alternarFinalizadoAction, {})

  return (
    <div className="grid gap-2">
      <form action={acao}>
        <input type="hidden" name="projeto_id" value={projetoId} />
        <input type="hidden" name="finalizado" value={finalizado ? "0" : "1"} />
        <Button type="submit" variant="outline" size="sm" disabled={pendente}>
          {pendente ? (
            <Loader2 className="animate-spin" />
          ) : finalizado ? (
            <RotateCcw />
          ) : (
            <CheckCircle2 />
          )}
          {finalizado ? "Reabrir projeto" : "Marcar como finalizado"}
        </Button>
      </form>
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
    </div>
  )
}
