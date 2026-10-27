"use client"

import { useActionState } from "react"
import { Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"

import { cancelarViagemAction } from "./actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

/** Cancelar a própria viagem enquanto ninguém começou a atender. */
export function CancelarViagemBotao({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(cancelarViagemAction, {})
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) => {
      confirmarEnvio(e, "Cancelar esta solicitação de viagem?")},
  })

  return (
    <form
      action={formAction} {...envio}
      className="inline-flex items-center"
    >
      <input type="hidden" name="id" value={id} />
      {estado.erro && <span className="text-destructive mr-1 text-xs">{estado.erro}</span>}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        className="text-destructive hover:text-destructive h-7 px-2"
      >
        {pendente ? <Loader2 className="animate-spin" /> : <X />}
        Cancelar
      </Button>
    </form>
  )
}
