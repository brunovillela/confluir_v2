"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { salvarFaixasHoraExtraAction } from "./actions"

/**
 * Percentual de cada faixa de hora extra na entidade (o acordo coletivo pode
 * pagar mais que os 50% da CLT). Muda só os rótulos — as horas lançadas não
 * mudam.
 */
export function FaixasHoraExtraForm({ faixa1, faixa2 }: { faixa1: number; faixa2: number }) {
  const [estado, formAction, pendente] = useActionState(salvarFaixasHoraExtraAction, {})
  return (
    <form action={formAction} className="grid gap-3 px-6 pb-5">
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
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="faixa1">Faixa 1 — dias úteis (%)</Label>
          <Input id="faixa1" name="faixa1" inputMode="decimal" defaultValue={String(faixa1).replace(".", ",")} />
          <p className="text-muted-foreground text-xs">A CLT garante no mínimo 50%; o acordo pode pagar mais.</p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="faixa2">Faixa 2 — domingos, feriados e folgas (%)</Label>
          <Input id="faixa2" name="faixa2" inputMode="decimal" defaultValue={String(faixa2).replace(".", ",")} />
          <p className="text-muted-foreground text-xs">Em geral 100%.</p>
        </div>
      </div>
      <Button type="submit" disabled={pendente} className="justify-self-start">
        {pendente && <Loader2 className="animate-spin" />}
        Salvar percentuais
      </Button>
    </form>
  )
}
