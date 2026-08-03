"use client"

import { useActionState, useState } from "react"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { type EstadoForm } from "@/lib/contas"

import { excluirLancamentosDaFonte } from "./actions"

export function ExcluirLancamentosFonte({
  remessaId,
  fonteId,
  quantidade,
}: {
  remessaId: string
  fonteId: string
  quantidade: number
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    excluirLancamentosDaFonte,
    {}
  )
  const [confirmado, setConfirmado] = useState(false)
  const n = quantidade.toLocaleString("pt-BR")

  if (quantidade === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nenhum lançamento desta fonte nesta remessa para excluir.
      </p>
    )
  }

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="remessa_id" value={remessaId} />
      <input type="hidden" name="fonte_id" value={fonteId} />
      <p className="text-muted-foreground text-sm">
        Apaga <strong>todos os {n} lançamentos</strong> desta fonte nesta remessa
        (para desfazer uma importação errada). O depósito e as outras fontes não
        são afetados. Não pode ser desfeito.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={confirmado}
          onChange={(e) => setConfirmado(e.target.checked)}
          className="size-4"
        />
        Entendo que os {n} lançamentos serão apagados.
      </label>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button
          type="submit"
          variant="destructive"
          size="sm"
          disabled={!confirmado || pendente}
        >
          {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
          Excluir os {n} lançamentos
        </Button>
      </div>
    </form>
  )
}
