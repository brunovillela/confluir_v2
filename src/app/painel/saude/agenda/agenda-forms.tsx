"use client"

import { useActionState } from "react"
import { Loader2, Save, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AgendamentoSaude, Profissional } from "@/lib/db/atendimentos"

import { excluirAgendamentoAction, salvarAgendamentoAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function AgendamentoForm({
  agendamento,
  assistidos,
  profissionais,
}: {
  agendamento?: AgendamentoSaude
  assistidos: { id: string; nome: string }[]
  profissionais: Profissional[]
}) {
  const [estado, formAction, pendente] = useActionState(
    salvarAgendamentoAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-4">
      {agendamento && <input type="hidden" name="id" value={agendamento.id} />}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5 lg:col-span-2">
          <Label htmlFor="assistido_id">Assistido *</Label>
          <select
            id="assistido_id"
            name="assistido_id"
            required
            defaultValue={agendamento?.assistido_id ?? ""}
            className={SELECT}
          >
            <option value="" disabled>
              Escolha o assistido
            </option>
            {assistidos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="inicio">Data *</Label>
          <Input
            id="inicio"
            name="inicio"
            type="date"
            required
            defaultValue={agendamento?.inicio ?? ""}
            className="[color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="termino">Término</Label>
          <Input
            id="termino"
            name="termino"
            type="date"
            defaultValue={agendamento?.termino ?? ""}
            className="[color-scheme:light] dark:[color-scheme:dark]"
          />
          <p className="text-muted-foreground text-xs">
            Só para acompanhamento de vários dias.
          </p>
        </div>

        <div className="grid gap-1.5 lg:col-span-2">
          <Label htmlFor="profissional_id">Profissional</Label>
          <select
            id="profissional_id"
            name="profissional_id"
            defaultValue={agendamento?.profissional_id ?? ""}
            className={SELECT}
          >
            <option value="">— não informado —</option>
            {profissionais
              .filter((p) => !p.inativo)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.usuarioNome ?? p.profissao ?? "Profissional"}
                </option>
              ))}
          </select>
        </div>

        <div className="flex items-end">
          <label className="flex items-center gap-2 pb-2 text-sm">
            <input
              type="checkbox"
              name="online"
              defaultChecked={agendamento?.online}
            />
            Atendimento online
          </label>
        </div>
      </div>

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {agendamento ? "Salvar alterações" : "Agendar"}
        </Button>
      </div>
    </form>
  )
}

export function ExcluirAgendamentoForm({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(
    excluirAgendamentoAction,
    {}
  )
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        title="Excluir agendamento"
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
      {estado.erro && (
        <p className="text-destructive mt-1 text-xs">{estado.erro}</p>
      )}
    </form>
  )
}
