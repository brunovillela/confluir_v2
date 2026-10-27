"use client"

import { useActionState } from "react"
import { Loader2, Undo2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { desfazerFaturaAction } from "../actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

/** Desfazer enquanto a ordem ainda está em autorização (lançou errado). */
export function DesfazerFatura({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(desfazerFaturaAction, {})
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) => {
        confirmarEnvio(e, "Desfazer esta fatura? A ordem de pagamento e a compra são apagadas e os itens voltam para “a faturar”.")
      },
  })
  return (
    <form
      action={formAction} {...envio}
     
      className="grid gap-2"
    >
      <input type="hidden" name="id" value={id} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="flex items-center justify-end gap-3">
        <p className="text-muted-foreground text-xs">
          Lançou errado? Enquanto a ordem está em autorização, dá para desfazer.
        </p>
        <Button
          type="submit"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          disabled={pendente}
        >
          {pendente ? <Loader2 className="animate-spin" /> : <Undo2 />}
          Desfazer fatura
        </Button>
      </div>
    </form>
  )
}
