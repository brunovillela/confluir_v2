"use client"

import { useActionState } from "react"
import { Check, Link2, Loader2, Plus, RotateCcw, Unlink } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { type EstadoForm } from "@/lib/contas"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { type OpcaoPessoa, type TarefaAvulsa } from "@/lib/db/nucleo"
import { formatarData } from "@/lib/formato"

import {
  alternarConclusaoTarefaAction,
  criarTarefaAction,
  desvincularTarefaAction,
  vincularTarefaAction,
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

/**
 * Traz uma tarefa avulsa (sem demanda, projeto nem anomalia) para a demanda ou
 * o projeto da tela. No projeto, ela entra também na demanda do projeto.
 */
export function VincularTarefa({ pai, avulsas }: { pai: PaiFixo; avulsas: TarefaAvulsa[] }) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(vincularTarefaAction, {})
  if (avulsas.length === 0) return null
  return (
    <form action={formAction} className="grid gap-2 sm:grid-cols-[1fr_auto]">
      <input type="hidden" name={pai.campo} value={pai.id} />
      <select name="tarefa_id" defaultValue="" required className={SELECT} aria-label="Tarefa avulsa a vincular">
        <option value="">Vincular uma tarefa avulsa…</option>
        {avulsas.map((t) => (
          <option key={t.id} value={t.id}>
            {t.titulo ?? "(sem título)"}
            {t.demandadoNome ? ` — ${t.demandadoNome}` : ""}
            {t.prazo ? ` · até ${formatarData(t.prazo)}` : ""}
          </option>
        ))}
      </select>
      <div className="flex items-start">
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Link2 />}
          Vincular
        </Button>
      </div>
      {estado.erro && <p className="text-destructive text-sm sm:col-span-2">{estado.erro}</p>}
    </form>
  )
}

/** Tira a tarefa da demanda ou do projeto: ela continua existindo, avulsa. */
export function DesvincularTarefa({ tarefaId, titulo, pai }: { tarefaId: string; titulo: string | null; pai: PaiFixo }) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(desvincularTarefaAction, {})
  const onde = pai.campo === "projeto_id" ? "deste projeto" : "desta demanda"
  return (
    <form
      action={formAction}
      onSubmit={(e) =>
        confirmarEnvio(e, {
          titulo: "Desvincular a tarefa?",
          descricao: `"${titulo ?? "(sem título)"}" deixa de ser ${onde} e continua existindo como tarefa avulsa, com o mesmo responsável e prazo.`,
          confirmar: "Desvincular",
        })
      }
      className="inline"
    >
      <input type="hidden" name="tarefa_id" value={tarefaId} />
      <input type="hidden" name={pai.campo} value={pai.id} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        title={`Desvincular ${onde}`}
        aria-label={`Desvincular a tarefa ${onde}`}
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Unlink />}
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}
