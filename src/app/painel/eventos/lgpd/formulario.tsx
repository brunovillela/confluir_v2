"use client"

import { useActionState } from "react"
import { Check, Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { marcarRemocaoAction } from "../configuracao/actions"

export function BaixarPendencia({
  pedidoId,
  sistema,
}: {
  pedidoId: string
  sistema: string
}) {
  const [estado, formAction, pendente] = useActionState(marcarRemocaoAction, {})

  if (estado.ok) {
    return (
      <Alert variant="success">
        <AlertDescription className="text-xs">{estado.ok}</AlertDescription>
      </Alert>
    )
  }

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="pedidoId" value={pedidoId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription className="text-xs">{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Check />}
          Já removi do {sistema}
        </Button>
      </div>
    </form>
  )
}
