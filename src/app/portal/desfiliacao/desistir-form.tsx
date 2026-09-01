"use client"

import { useState } from "react"
import { useActionState } from "react"
import { Loader2, LogOut } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { desistirFiliacaoColetiva } from "./actions"

export function DesistirForm({ preview }: { preview: boolean }) {
  const [aberto, setAberto] = useState(false)
  const [estado, action, pend] = useActionState(desistirFiliacaoColetiva, {})

  if (estado.ok) {
    return (
      <Alert className="border-success/40 text-success-fg">
        <AlertDescription>{estado.ok}</AlertDescription>
      </Alert>
    )
  }

  if (!aberto) {
    return (
      <Button
        variant="outline"
        onClick={() => setAberto(true)}
        disabled={preview}
        title={preview ? "Visualização da gestão é somente leitura" : undefined}
      >
        <LogOut className="size-4" />
        Quero desistir da filiação
      </Button>
    )
  }

  return (
    <form action={action} className="grid max-w-md gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="confirmacao">
          Digite CONFIRMO para concluir o pedido
        </Label>
        <Input
          id="confirmacao"
          name="confirmacao"
          placeholder="CONFIRMO"
          autoComplete="off"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={pend}>
          {pend ? <Loader2 className="animate-spin" /> : <LogOut className="size-4" />}
          Confirmar desistência
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
