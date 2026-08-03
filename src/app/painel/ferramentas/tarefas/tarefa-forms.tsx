"use client"

import { useActionState } from "react"
import { Check, Loader2, Plus, RotateCcw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { type EstadoForm } from "@/lib/contas"
import { type OpcaoPessoa } from "@/lib/db/nucleo"

import {
  alternarConclusaoTarefaAction,
  criarTarefaAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type PaiFixo = {
  campo: "demanda_id" | "projeto_id" | "anomalia_id"
  id: string
}

function SelectPessoa({
  nome,
  rotulo,
  pessoas,
}: {
  nome: string
  rotulo: string
  pessoas: OpcaoPessoa[]
}) {
  return (
    <select name={nome} defaultValue="" className={SELECT} aria-label={rotulo}>
      <option value="">{rotulo}</option>
      {pessoas.map((p) => (
        <option key={p.id} value={p.id}>
          {p.nome}
        </option>
      ))}
    </select>
  )
}

/** Formulário compacto de nova tarefa. `pai` fixa o vínculo (demanda/anomalia/projeto). */
export function AdicionarTarefa({
  pessoas,
  pai,
}: {
  pessoas: OpcaoPessoa[]
  pai?: PaiFixo
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    criarTarefaAction,
    {}
  )

  // Campos não controlados: o React 19 reseta o form após a action concluir,
  // limpando os campos para o próximo lançamento sem precisar de key/efeito.
  return (
    <form action={formAction} className="grid gap-2 sm:grid-cols-[1fr_auto]">
      {pai && <input type="hidden" name={pai.campo} value={pai.id} />}
      <div className="grid gap-2 sm:grid-cols-2">
        <Input
          name="titulo"
          required
          placeholder="Descreva a tarefa"
          className="sm:col-span-2"
        />
        <SelectPessoa nome="demandado_id" rotulo="Responsável (demandado)" pessoas={pessoas} />
        <Input
          name="data_prazo_entrega"
          type="date"
          aria-label="Prazo"
          className="[color-scheme:light] dark:[color-scheme:dark]"
        />
      </div>
      <div className="flex items-start">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Adicionar
        </Button>
      </div>
      {estado.erro && (
        <p className="text-destructive text-sm sm:col-span-2">{estado.erro}</p>
      )}
    </form>
  )
}

/** Botão de concluir / reabrir uma tarefa. */
export function ToggleTarefa({
  tarefaId,
  concluido,
  pai,
}: {
  tarefaId: string
  concluido: boolean
  pai?: PaiFixo
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    alternarConclusaoTarefaAction,
    {}
  )
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="tarefa_id" value={tarefaId} />
      <input type="hidden" name="concluir" value={concluido ? "0" : "1"} />
      {pai && <input type="hidden" name={pai.campo} value={pai.id} />}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        title={concluido ? "Reabrir" : "Concluir"}
        aria-label={concluido ? "Reabrir tarefa" : "Concluir tarefa"}
      >
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : concluido ? (
          <RotateCcw />
        ) : (
          <Check />
        )}
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}
