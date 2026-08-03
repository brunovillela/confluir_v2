"use client"

import { useActionState, useState } from "react"
import { Check, Loader2, Pencil, Trash2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { atualizarContribuicao, excluirContribuicao } from "./actions"

/** Editar/excluir um lançamento da relação (inline na linha da tabela). */
export function LancamentoAcoes({
  remessaId,
  fonteId,
  lancamentoId,
  valor,
}: {
  remessaId: string
  fonteId: string
  lancamentoId: string
  valor: number | null
}) {
  const [editando, setEditando] = useState(false)
  const [salvar, salvarAction, salvando] = useActionState(
    atualizarContribuicao,
    {}
  )
  const [, excluirAction, excluindo] = useActionState(excluirContribuicao, {})

  if (editando) {
    return (
      <form action={salvarAction} className="flex items-center justify-end gap-1.5">
        <input type="hidden" name="remessa_id" value={remessaId} />
        <input type="hidden" name="fonte_id" value={fonteId} />
        <input type="hidden" name="lancamento_id" value={lancamentoId} />
        <Input
          name="valor"
          inputMode="decimal"
          defaultValue={
            valor !== null
              ? valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })
              : ""
          }
          className="h-7 w-28 text-right text-sm"
          aria-label="Novo valor"
          autoFocus
          required
        />
        <Button type="submit" variant="ghost" size="icon" className="size-7" disabled={salvando} aria-label="Salvar valor">
          {salvando ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => setEditando(false)}
          aria-label="Cancelar edição"
        >
          <X className="size-3.5" />
        </Button>
        {salvar.erro && (
          <span className="text-destructive text-xs">{salvar.erro}</span>
        )}
      </form>
    )
  }

  return (
    <span className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        onClick={() => setEditando(true)}
        aria-label="Editar valor"
      >
        <Pencil className="size-3.5" />
      </Button>
      <form
        action={excluirAction}
        className="inline"
        onSubmit={(e) => {
          if (!confirm("Excluir este lançamento da remessa?")) e.preventDefault()
        }}
      >
        <input type="hidden" name="remessa_id" value={remessaId} />
        <input type="hidden" name="fonte_id" value={fonteId} />
        <input type="hidden" name="lancamento_id" value={lancamentoId} />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive size-7"
          disabled={excluindo}
          aria-label="Excluir lançamento"
        >
          {excluindo ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Trash2 className="size-3.5" />
          )}
        </Button>
      </form>
    </span>
  )
}
