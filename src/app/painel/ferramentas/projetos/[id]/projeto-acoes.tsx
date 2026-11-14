"use client"

import { useActionState } from "react"
import { CheckCircle2, Loader2, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"

import { alternarFinalizadoAction } from "../actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { avisoTarefasAoFinalizar } from "@/lib/nucleo-constantes"

/**
 * Botão do editor: finalizar / reabrir o projeto. Com tarefas abertas,
 * finalizar avisa antes que elas serão concluídas junto.
 */
export function ProjetoAcoes({
  projetoId,
  finalizado,
  pendentes = 0,
}: {
  projetoId: string
  finalizado: boolean
  pendentes?: number
}) {
  const [estado, acao, pendente] = useActionState(alternarFinalizadoAction, {})
  const envio = useEnvioFormulario(acao, estado, {
    antes: (e) => {
      if (!finalizado && pendentes > 0) confirmarEnvio(e, avisoTarefasAoFinalizar(pendentes, "projeto"))
    },
  })

  return (
    <div className="grid gap-2">
      <form action={acao} {...envio}>
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
