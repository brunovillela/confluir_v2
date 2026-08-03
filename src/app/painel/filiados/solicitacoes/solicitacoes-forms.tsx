"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { avaliarSolicitacaoAction } from "./actions"

export function AvaliarFichaForm({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(
    avaliarSolicitacaoAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="motivo">Motivo (obrigatório para reprovar)</Label>
        <Textarea id="motivo" name="motivo" rows={2} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" name="decisao" value="aprovar" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Aprovar e criar filiação
        </Button>
        <Button
          type="submit"
          name="decisao"
          value="reprovar"
          variant="destructive"
          disabled={pendente}
        >
          Reprovar
        </Button>
      </div>
    </form>
  )
}
