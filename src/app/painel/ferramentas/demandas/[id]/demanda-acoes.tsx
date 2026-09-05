"use client"

import { useActionState } from "react"
import { Loader2, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { type EstadoForm } from "@/lib/contas"
import { SITUACOES_DEMANDA } from "@/lib/nucleo-constantes"

import {
  definirSituacaoDemandaAction,
  excluirDemandaAction,
} from "../actions"

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

/**
 * Exclusão da demanda — só aparece para quem pode apagar (o criador; nas
 * demandas antigas, sem criador registrado, o responsável).
 *
 * A confirmação NOMEIA o que vai junto: checklists e comentários somem, mas as
 * tarefas apenas se desligam da demanda. Elas pertencem à área Tarefas, podem
 * ser de outra pessoa, e apagá-las junto destruiria trabalho alheio.
 */
export function ExcluirDemanda({
  demandaId,
  nome,
  tarefas,
  checklists,
  comentarios,
}: {
  demandaId: string
  nome: string | null
  tarefas: number
  checklists: number
  comentarios: number
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    excluirDemandaAction,
    {}
  )

  const somem = [
    checklists > 0
      ? `${checklists} ${checklists === 1 ? "checklist" : "checklists"}`
      : null,
    comentarios > 0
      ? `${comentarios} ${comentarios === 1 ? "comentário" : "comentários"}`
      : null,
  ].filter(Boolean)

  const aviso = [
    `Excluir a demanda "${nome ?? ""}"?`,
    somem.length > 0 ? `Serão apagados: ${somem.join(" e ")}.` : null,
    tarefas > 0
      ? `${tarefas} ${tarefas === 1 ? "tarefa continua existindo" : "tarefas continuam existindo"}, mas ${tarefas === 1 ? "fica" : "ficam"} sem demanda.`
      : null,
    "Esta ação não pode ser desfeita.",
  ]
    .filter(Boolean)
    .join("\n\n")

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(aviso)) e.preventDefault()
      }}
      className="grid gap-2"
    >
      <input type="hidden" name="demanda_id" value={demandaId} />
      {estado.erro && (
        <p className="text-destructive text-xs">{estado.erro}</p>
      )}
      <div>
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          className="text-destructive"
          disabled={pendente}
        >
          {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
          Excluir demanda
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {tarefas > 0
          ? `As ${tarefas === 1 ? "tarefa" : `${tarefas} tarefas`} não ${tarefas === 1 ? "será apagada" : "serão apagadas"} — apenas ${tarefas === 1 ? "deixa" : "deixam"} de pertencer a esta demanda.`
          : "Checklists e comentários desta demanda serão apagados junto."}
      </p>
    </form>
  )
}
