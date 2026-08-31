"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { FREQUENCIAS } from "@/lib/pessoal-sst-constantes"

import { salvarLimiarRotina } from "./actions"

export function LimiarForm({ atual }: { atual: string }) {
  const [estado, action, pendente] = useActionState(salvarLimiarRotina, {})
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      {estado.erro && (
        <Alert variant="destructive" className="w-full">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg w-full">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="sst_rotina_frequencia">
          Rotineira a partir de (frequência)
        </Label>
        <select
          id="sst_rotina_frequencia"
          name="sst_rotina_frequencia"
          defaultValue={atual}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
        >
          {FREQUENCIAS.filter((f) => f.valor !== "sob_demanda").map((f) => (
            <option key={f.valor} value={f.valor}>
              {f.rotulo}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pendente}>
        {pendente && <Loader2 className="animate-spin" />}
        Salvar limiar
      </Button>
    </form>
  )
}
