"use client"

import { useActionState } from "react"
import { CheckCheck, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"

import { marcarTodasComoLidas } from "./actions"

export function MarcarTodasBotao() {
  const [, formAction, pendente] = useActionState(marcarTodasComoLidas, {})

  return (
    <form action={formAction}>
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <CheckCheck />}
        Marcar todas como lidas
      </Button>
    </form>
  )
}
