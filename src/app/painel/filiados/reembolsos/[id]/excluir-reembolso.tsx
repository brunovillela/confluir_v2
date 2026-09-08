"use client"

import { useActionState, useState } from "react"
import { Loader2, Trash2, TriangleAlert, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { excluirReembolsoAction } from "../actions"

/**
 * Desfazer um lançamento. A confirmação diz o que acontece com a ordem: ela é
 * marcada excluída no Financeiro. Ordem paga não se desfaz — o servidor recusa.
 */
export function ExcluirReembolso({
  reembolsoId,
  filiadoId,
  ordemCodigo,
  paga,
}: {
  reembolsoId: string
  filiadoId: string | null
  ordemCodigo: string | null
  paga: boolean
}) {
  const [estado, formAction, pendente] = useActionState(excluirReembolsoAction, {})
  const [confirmando, setConfirmando] = useState(false)

  if (paga) return null

  if (!confirmando) {
    return (
      <div className="grid gap-2 border-t pt-4">
        {estado.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estado.erro}</AlertDescription>
          </Alert>
        )}
        <div className="flex justify-end">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setConfirmando(true)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 />
            Desfazer este lançamento
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="border-destructive/40 bg-destructive/5 grid gap-4 rounded-lg border p-4">
      <div className="flex items-start gap-2">
        <TriangleAlert className="text-destructive mt-0.5 size-5 shrink-0" />
        <div>
          <h3 className="font-medium">Desfazer este reembolso?</h3>
          <p className="text-muted-foreground mt-1 text-sm">
            O registro some do perfil do filiado e do prontuário
            {ordemCodigo ? `, e a ordem ${ordemCodigo} é marcada como excluída no Financeiro` : ""}.
          </p>
        </div>
      </div>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <form action={formAction} className="flex justify-end gap-2">
        <input type="hidden" name="reembolso_id" value={reembolsoId} />
        {filiadoId && <input type="hidden" name="filiado_id" value={filiadoId} />}
        <Button type="button" variant="ghost" onClick={() => setConfirmando(false)}>
          <X />
          Cancelar
        </Button>
        <Button type="submit" variant="destructive" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
          Desfazer
        </Button>
      </form>
    </div>
  )
}
