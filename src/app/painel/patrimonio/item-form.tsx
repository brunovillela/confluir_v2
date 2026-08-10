"use client"

import { useActionState } from "react"
import { Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { type EstadoForm } from "@/lib/contas"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type ItemFormDados = {
  id?: string
  nome?: string | null
  descricao?: string | null
  numero_patrimonio?: string | null
  numero_patrimonio_antigo?: string | null
  numero_unico?: string | null
  recinto_id?: string | null
}

export function ItemForm({
  action,
  dados,
  recintos,
}: {
  action: (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>
  dados?: ItemFormDados
  recintos: { id: string; rotulo: string }[]
}) {
  const [estado, formAction, pendente] = useActionState(action, {})

  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      {dados?.id && <input type="hidden" name="item_id" value={dados.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="nome">Nome *</Label>
          <Input
            id="nome"
            name="nome"
            required
            defaultValue={dados?.nome ?? ""}
            placeholder="Notebook Dell Latitude 5420"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="numero_patrimonio">Número de patrimônio</Label>
          <Input
            id="numero_patrimonio"
            name="numero_patrimonio"
            defaultValue={dados?.numero_patrimonio ?? ""}
            className="tabular-nums"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="recinto_id">Recinto</Label>
          <select
            id="recinto_id"
            name="recinto_id"
            defaultValue={dados?.recinto_id ?? ""}
            className={SELECT}
          >
            <option value="">(sem recinto)</option>
            {recintos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="numero_patrimonio_antigo">
            Número de patrimônio antigo
          </Label>
          <Input
            id="numero_patrimonio_antigo"
            name="numero_patrimonio_antigo"
            defaultValue={dados?.numero_patrimonio_antigo ?? ""}
            className="tabular-nums"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="numero_unico">Número único</Label>
          <Input
            id="numero_unico"
            name="numero_unico"
            defaultValue={dados?.numero_unico ?? ""}
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="descricao">Descrição</Label>
          <Textarea
            id="descricao"
            name="descricao"
            rows={3}
            defaultValue={dados?.descricao ?? ""}
            placeholder="Especificações, estado de conservação, observações…"
          />
        </div>
      </div>

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {dados?.id ? "Salvar alterações" : "Cadastrar item"}
        </Button>
      </div>
    </form>
  )
}
