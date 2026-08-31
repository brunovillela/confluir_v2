"use client"

import { useActionState } from "react"
import { Loader2, Wand2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { importarFuncoesDosCargos } from "../actions"

export function ImportarCargos() {
  const [estado, action, pend] = useActionState(importarFuncoesDosCargos, {})
  return (
    <div className="grid gap-2">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <form action={action}>
        <Button type="submit" variant="outline" size="sm" disabled={pend}>
          {pend ? <Loader2 className="animate-spin" /> : <Wand2 className="size-4" />}
          Gerar funções a partir dos cargos dos funcionários
        </Button>
      </form>
      <p className="text-muted-foreground text-xs">
        Cria uma função por cargo dos vínculos (grafias normalizadas) e vincula
        cada funcionário à sua — sem sobrescrever vínculos já feitos.
      </p>
    </div>
  )
}
