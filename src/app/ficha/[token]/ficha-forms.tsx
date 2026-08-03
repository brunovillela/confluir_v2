"use client"

import { useActionState } from "react"
import { Loader2, Upload } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { subirFichaAssinadaAction } from "./actions"

export function UploadAssinadaForm({ token }: { token: string }) {
  const [estado, formAction, pendente] = useActionState(
    subirFichaAssinadaAction,
    {}
  )

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="arquivo">Ficha assinada (PDF)</Label>
        <Input
          id="arquivo"
          name="arquivo"
          type="file"
          accept="application/pdf"
          required
        />
      </div>
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Upload />}
          Enviar ficha assinada
        </Button>
      </div>
    </form>
  )
}
