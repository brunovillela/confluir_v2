"use client"

import { useActionState, useState } from "react"
import { Loader2, ShieldCheck, Undo2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { mascaraCpf } from "@/lib/mascaras"

import { abonarAction, liberarAction } from "./actions"

export function AbonarForm({ cupomId }: { cupomId: string }) {
  const [estado, formAction, pendente] = useActionState(abonarAction, {})
  if (estado.ok) return <span className="text-success-fg text-xs">{estado.ok}</span>

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="cupom_id" value={cupomId} />
      <Input
        name="motivo"
        placeholder="Justificativa (ex.: internado no dia)"
        className="h-8 w-56"
        aria-label="Justificativa do abono"
        required
      />
      <Button type="submit" size="sm" variant="outline" className="h-8" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Undo2 />}
        Abonar
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

export function LiberarForm() {
  const [estado, formAction, pendente] = useActionState(liberarAction, {})
  const [cpf, setCpf] = useState("")

  return (
    <form action={formAction} className="grid gap-3">
      {(estado.erro || estado.ok) && (
        <Alert variant={estado.erro ? "destructive" : "success"}>
          <AlertDescription>{estado.erro ?? estado.ok}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="cpf-liberar">CPF do filiado</Label>
          <Input
            id="cpf-liberar"
            name="cpf"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(mascaraCpf(e.target.value))}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="motivo-liberar">Justificativa</Label>
          <Input
            id="motivo-liberar"
            name="motivo"
            placeholder="Ex.: decisão da diretoria em 10/09"
            required
          />
        </div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
          Liberar
        </Button>
      </div>
    </form>
  )
}
