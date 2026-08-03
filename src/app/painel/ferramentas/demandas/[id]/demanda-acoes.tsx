"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { type EstadoForm } from "@/lib/contas"
import { SITUACOES_DEMANDA } from "@/lib/nucleo-constantes"

import { definirSituacaoDemandaAction } from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/** Troca rápida de situação (submete ao mudar). */
export function SituacaoDemanda({
  demandaId,
  situacao,
}: {
  demandaId: string
  situacao: string | null
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    definirSituacaoDemandaAction,
    {}
  )

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="demanda_id" value={demandaId} />
      <select
        name="situacao"
        defaultValue={situacao ?? "A fazer"}
        className={SELECT}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        {SITUACOES_DEMANDA.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      {pendente && <Loader2 className="text-muted-foreground size-4 animate-spin" />}
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}
