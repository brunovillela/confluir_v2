"use client"

import { useActionState } from "react"
import { Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"
import { TIPOS_PROJETO } from "@/lib/projetos-constantes"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type ProjetoFormDados = {
  id?: string
  titulo?: string | null
  tipo?: string | null
  detalhamento?: string | null
  orcamento?: number | null
  inicio?: string | null
  termino_previsao?: string | null
  centro_custo_id?: string | null
  estrategico?: boolean | null
}

export function ProjetoForm({
  action,
  dados,
  centros,
}: {
  action: (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>
  dados?: ProjetoFormDados
  centros: { id: string; rotulo: string }[]
}) {
  const [estado, formAction, pendente] = useActionState(action, {})

  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      {dados?.id && <input type="hidden" name="projeto_id" value={dados.id} />}

      <div className="grid gap-1.5">
        <Label htmlFor="titulo">Título do projeto *</Label>
        <Input
          id="titulo"
          name="titulo"
          required
          defaultValue={dados?.titulo ?? ""}
          placeholder="Ex.: Festa Julina do NF"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="tipo">Tipo *</Label>
          <select
            id="tipo"
            name="tipo"
            required
            defaultValue={dados?.tipo ?? ""}
            className={SELECT}
          >
            <option value="" disabled>
              (selecione)
            </option>
            {[
              ...TIPOS_PROJETO,
              ...(dados?.tipo &&
              !(TIPOS_PROJETO as readonly string[]).includes(dados.tipo)
                ? [dados.tipo]
                : []),
            ].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
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
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="inicio">Início</Label>
          <Input
            id="inicio"
            name="inicio"
            type="date"
            defaultValue={dados?.inicio ?? ""}
            className="[color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="termino_previsao">Término previsto</Label>
          <Input
            id="termino_previsao"
            name="termino_previsao"
            type="date"
            defaultValue={dados?.termino_previsao ?? ""}
            className="[color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="centro_custo_id">Centro de custo</Label>
          <select
            id="centro_custo_id"
            name="centro_custo_id"
            defaultValue={dados?.centro_custo_id ?? ""}
            className={SELECT}
          >
            <option value="">(não vinculado)</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="detalhamento">Detalhamento</Label>
        <textarea
          id="detalhamento"
          name="detalhamento"
          rows={5}
          defaultValue={dados?.detalhamento ?? ""}
          className="border-input bg-background text-foreground min-h-24 rounded-md border px-3 py-2 text-sm shadow-xs outline-none"
          placeholder="Descrição, objetivos e observações do projeto"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="estrategico"
          value="1"
          defaultChecked={dados?.estrategico === true}
          className="size-4"
        />
        Projeto estratégico
      </label>

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {dados?.id ? "Salvar alterações" : "Cadastrar projeto"}
        </Button>
      </div>
    </form>
  )
}
