"use client"

import { useActionState } from "react"
import { Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import { type OpcaoPessoa } from "@/lib/db/nucleo"
import { SITUACOES_DEMANDA } from "@/lib/nucleo-constantes"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type DemandaFormDados = {
  id?: string
  nome?: string | null
  descricao?: string | null
  situacao?: string | null
  prazo?: string | null
  orcamento?: number | null
  membro_responsavel_id?: string | null
}

export function DemandaForm({
  action,
  dados,
  pessoas,
}: {
  action: (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>
  dados?: DemandaFormDados
  pessoas: OpcaoPessoa[]
}) {
  const [estado, formAction, pendente] = useActionState(action, {})

  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      {dados?.id && <input type="hidden" name="demanda_id" value={dados.id} />}

      <div className="grid gap-1.5">
        <Label htmlFor="nome">Nome da demanda *</Label>
        <Input
          id="nome"
          name="nome"
          required
          defaultValue={dados?.nome ?? ""}
          placeholder="Ex.: Atuação no Conselho Nacional de Saúde"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="situacao">Situação</Label>
          <select
            id="situacao"
            name="situacao"
            defaultValue={dados?.situacao ?? "A fazer"}
            className={SELECT}
          >
            {SITUACOES_DEMANDA.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="membro_responsavel_id">Responsável</Label>
          <select
            id="membro_responsavel_id"
            name="membro_responsavel_id"
            defaultValue={dados?.membro_responsavel_id ?? ""}
            className={SELECT}
          >
            <option value="">(não definido)</option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="prazo">Prazo</Label>
          <Input
            id="prazo"
            name="prazo"
            type="date"
            defaultValue={dados?.prazo ?? ""}
            className="[color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="orcamento">Orçamento (R$)</Label>
          <Input
            id="orcamento"
            name="orcamento"
            type="number"
            min={0}
            step="0.01"
            defaultValue={dados?.orcamento ?? ""}
            className="tabular-nums"
          />
          <span className="text-muted-foreground text-xs">
            Informativo — a demanda não passa por Compras.
          </span>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="descricao">Descrição</Label>
        <textarea
          id="descricao"
          name="descricao"
          rows={5}
          defaultValue={dados?.descricao ?? ""}
          className="border-input bg-background text-foreground min-h-24 rounded-md border px-3 py-2 text-sm shadow-xs outline-none"
          placeholder="Objetivo, contexto e encaminhamentos"
        />
      </div>

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {dados?.id ? "Salvar alterações" : "Criar demanda"}
        </Button>
      </div>
    </form>
  )
}
