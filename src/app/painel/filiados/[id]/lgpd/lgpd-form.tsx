"use client"

import { useActionState, useState } from "react"
import { Loader2, ShieldOff } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { anonimizarFiliacaoAction } from "./actions"

export function AnonimizarForm({ filiacaoId }: { filiacaoId: string }) {
  const [estado, acao, pendente] = useActionState(anonimizarFiliacaoAction, {})
  const [confirmacao, setConfirmacao] = useState("")
  return (
    <form action={acao} className="grid gap-3 border-t pt-4">
      <input type="hidden" name="filiacao_id" value={filiacaoId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="motivo">Motivo e referência do pedido *</Label>
        <Textarea
          id="motivo"
          name="motivo"
          required
          minLength={10}
          placeholder="Ex.: pedido do titular por e-mail em 01/10/2026, protocolo 123."
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="confirmacao">Digite ANONIMIZAR para confirmar</Label>
        <Input
          id="confirmacao"
          name="confirmacao"
          autoComplete="off"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          className="w-56"
        />
      </div>
      <div>
        <Button type="submit" variant="destructive" disabled={pendente || confirmacao !== "ANONIMIZAR"}>
          {pendente ? <Loader2 className="animate-spin" /> : <ShieldOff />}
          Anonimizar este cadastro
        </Button>
      </div>
    </form>
  )
}
