"use client"

import { useActionState } from "react"
import { Ban, CheckCircle2, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"

import { alternarAtivoItemAction } from "../actions"

/** Botão do gestor: ativar/inativar o item (com confirmação). */
export function ItemAcoes({
  itemId,
  ativo,
  podeEditar = true,
}: {
  itemId: string
  ativo: boolean
  podeEditar?: boolean
}) {
  const [estado, acao, pendente] = useActionState(alternarAtivoItemAction, {})

  if (!podeEditar) return null

  return (
    <div className="grid gap-2">
      <form
        action={acao}
        onSubmit={(e) => {
          if (
            ativo &&
            !confirm(
              "Inativar este item? Ele sai da lista de itens ativos do patrimônio."
            )
          ) {
            e.preventDefault()
          }
        }}
      >
        <input type="hidden" name="item_id" value={itemId} />
        <input type="hidden" name="ativo" value={ativo ? "0" : "1"} />
        <Button type="submit" variant="outline" size="sm" disabled={pendente}>
          {pendente ? (
            <Loader2 className="animate-spin" />
          ) : ativo ? (
            <Ban />
          ) : (
            <CheckCircle2 />
          )}
          {ativo ? "Inativar item" : "Reativar item"}
        </Button>
      </form>
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
    </div>
  )
}
