"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { aplicarReajuste } from "../actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"

export function ReajusteConfirmarForm({
  percentualTexto,
  degraus,
}: {
  /** Percentual como digitado (pt-BR), repassado à action. */
  percentualTexto: string
  degraus: number
}) {
  const [estado, formAction, pendente] = useActionState(aplicarReajuste, {})

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        confirmarEnvio(e, `Aplicar reajuste de ${percentualTexto}% em ${degraus} degraus da tabela salarial? A alteração vale para todos os cargos e não tem desfazer automático.`)
      }}
      className="grid gap-3"
    >
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="percentual" value={percentualTexto} />
      <Button type="submit" disabled={pendente} className="justify-self-end">
        {pendente && <Loader2 className="animate-spin" />}
        Aplicar reajuste de {percentualTexto}%
      </Button>
    </form>
  )
}
