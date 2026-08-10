"use client"

import { useActionState } from "react"
import { Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { type EstadoForm } from "@/lib/contas"
import { SEDES_RECINTO } from "@/lib/patrimonio-constantes"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type RecintoFormDados = {
  id?: string
  nome?: string | null
  codigo?: string | null
  descricao_fisica?: string | null
  sede?: string | null
}

export function RecintoForm({
  action,
  dados,
}: {
  action: (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>
  dados?: RecintoFormDados
}) {
  const [estado, formAction, pendente] = useActionState(action, {})

  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      {dados?.id && <input type="hidden" name="recinto_id" value={dados.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="nome">Nome do recinto *</Label>
          <Input
            id="nome"
            name="nome"
            required
            defaultValue={dados?.nome ?? ""}
            placeholder="Sala da diretoria — Sede Campos"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="codigo">Código</Label>
          <Input
            id="codigo"
            name="codigo"
            defaultValue={dados?.codigo ?? ""}
            className="tabular-nums"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="sede">Sede</Label>
          <select
            id="sede"
            name="sede"
            defaultValue={dados?.sede ?? ""}
            className={SELECT}
          >
            <option value="">(não informada)</option>
            {SEDES_RECINTO.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="descricao_fisica">Descrição física</Label>
          <Textarea
            id="descricao_fisica"
            name="descricao_fisica"
            rows={3}
            defaultValue={dados?.descricao_fisica ?? ""}
            placeholder="Localização, andar, características do espaço…"
          />
        </div>
      </div>

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {dados?.id ? "Salvar alterações" : "Cadastrar recinto"}
        </Button>
      </div>
    </form>
  )
}
