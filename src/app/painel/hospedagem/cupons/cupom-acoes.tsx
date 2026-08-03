"use client"

import { useActionState } from "react"
import { Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"

import { cancelarCupom } from "./actions"

/** Cancelamento do cupom, com confirmação. Erros aparecem como alerta nativo. */
export function CancelarCupomBotao({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(cancelarCupom, {})

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Cancelar este cupom? A ação não pode ser desfeita.")) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      {estado.erro && (
        <span className="text-destructive mr-2 text-xs">{estado.erro}</span>
      )}
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
