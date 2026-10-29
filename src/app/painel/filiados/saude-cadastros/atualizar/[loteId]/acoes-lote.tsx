"use client"

import { useActionState } from "react"
import { Loader2, Trash2, Undo2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { type EstadoForm } from "@/lib/contas"

import { descartarRascunhoAction, desfazerLoteAction } from "../actions"

/** Desfaz o lote: cada campo volta ao valor anterior, se ninguém o mudou depois. */
export function DesfazerLote({ loteId, campos }: { loteId: string; campos: number }) {
  const [estado, acao, desfazendo] = useActionState<EstadoForm, FormData>(desfazerLoteAction, {})
  return (
    <form
      action={acao}
      onSubmit={(e) =>
        confirmarEnvio(e, {
          titulo: "Desfazer este lote?",
          descricao: `Os ${campos} campo(s) gravados voltam ao valor anterior. Campo que alguém alterou depois do lote fica como está. Cadastros criados a partir da lista não são apagados.`,
          confirmar: "Desfazer",
        })
      }
      className="grid gap-2"
    >
      <input type="hidden" name="lote_id" value={loteId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" variant="outline" disabled={desfazendo}>
          {desfazendo ? <Loader2 className="animate-spin" /> : <Undo2 />}
          Desfazer o lote
        </Button>
      </div>
    </form>
  )
}

export function DescartarRascunho({ loteId }: { loteId: string }) {
  return (
    <form action={descartarRascunhoAction} onSubmit={(e) => confirmarEnvio(e, "Descartar esta prévia? Nada foi gravado nos cadastros.")}>
      <input type="hidden" name="lote_id" value={loteId} />
      <Button type="submit" variant="ghost" size="sm">
        <Trash2 />
        Descartar a prévia
      </Button>
    </form>
  )
}
