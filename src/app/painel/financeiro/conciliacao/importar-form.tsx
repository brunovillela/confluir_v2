"use client"

import { useActionState } from "react"
import { Loader2, Upload } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { importarExtratoAction } from "./actions"

export function ImportarExtratoForm() {
  const [estado, action, enviando] = useActionState(importarExtratoAction, {})
  return (
    <form action={action} className="grid gap-3" key={estado.ok ?? "form"}>
      <ErroNoCampo estado={estado} />
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="arquivo">Extrato (OFX ou CSV)</Label>
          <Input id="arquivo" name="arquivo" type="file" accept=".ofx,.csv,.txt" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="conta_rotulo">Conta (opcional)</Label>
          <Input id="conta_rotulo" name="conta_rotulo" placeholder="Ex.: BB corrente" className="w-44" maxLength={60} />
        </div>
        <Button type="submit" disabled={enviando}>
          {enviando ? <Loader2 className="animate-spin" /> : <Upload />}
          Importar
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        No internet banking, exporte o extrato do período em OFX (Money/Quicken). Linhas já importadas não se repetem; o que casar com uma única ordem paga ou um único depósito é conciliado na hora.
      </p>
      {estado.erro && !estado.campo && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
    </form>
  )
}
