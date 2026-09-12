"use client"

import { useActionState } from "react"
import { Check, Loader2, Printer } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { anotarQuartoAction } from "./actions"

export function AnotarQuartoForm({
  noite,
  quarto,
  atual,
}: {
  noite: string
  quarto: number
  atual: string | null
}) {
  const [estado, formAction, pendente] = useActionState(anotarQuartoAction, {})

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2 print:hidden">
      <input type="hidden" name="noite" value={noite} />
      <input type="hidden" name="quarto" value={quarto} />
      <Input
        name="quarto_hotel"
        defaultValue={atual ?? ""}
        placeholder="Nº do quarto no hotel"
        aria-label={`Número do quarto no hotel para o quarto ${quarto} do convênio`}
        className="h-8 w-44"
        maxLength={30}
      />
      <Button type="submit" size="sm" variant="outline" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Check />}
        Anotar
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      {estado.ok && <span className="text-success-fg text-xs">{estado.ok}</span>}
    </form>
  )
}

export function ImprimirBotao() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()} className="print:hidden">
      <Printer />
      Imprimir lista
    </Button>
  )
}
