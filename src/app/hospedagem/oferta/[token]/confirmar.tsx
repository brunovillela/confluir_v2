"use client"

import { useActionState } from "react"
import { Check, Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { confirmarOfertaPublicaAction } from "./actions"

export function ConfirmarOfertaPublica({ token }: { token: string }) {
  const [estado, formAction, pendente] = useActionState(confirmarOfertaPublicaAction, {})

  if (estado.ok) {
    return (
      <Alert variant="success">
        <AlertDescription>{estado.ok}</AlertDescription>
      </Alert>
    )
  }

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="lg" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Check />}
        Confirmar minha reserva
      </Button>
    </form>
  )
}
