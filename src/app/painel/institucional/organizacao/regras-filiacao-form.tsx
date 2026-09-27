"use client"

import { useActionState } from "react"
import { Loader2, Save } from "lucide-react"

import { Button } from "@/components/ui/button"
import { type EstadoForm } from "@/lib/contas"
import { OPCOES_EXIGE_FONTE } from "@/lib/filiacao"

import { salvarRegrasFiliacaoAction } from "./actions"

export function RegrasFiliacaoForm({ exigeFonte }: { exigeFonte: boolean }) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    salvarRegrasFiliacaoAction,
    {}
  )
  return (
    <form action={formAction} className="grid gap-4">
      <fieldset className="grid gap-3 md:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">
          A filiação depende de uma fonte pagadora?
        </legend>
        {OPCOES_EXIGE_FONTE.map((o) => (
          <label
            key={o.valor}
            className="border-input has-[:checked]:border-primary has-[:checked]:bg-primary/5 hover:bg-muted/50 flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors"
          >
            <input
              type="radio"
              name="exige_fonte"
              value={o.valor}
              required
              defaultChecked={(o.valor === "sim") === exigeFonte}
              className="accent-primary mt-0.5 size-4 shrink-0"
            />
            <span className="grid gap-1">
              <span className="text-sm font-medium">{o.rotulo}</span>
              <span className="text-muted-foreground text-xs leading-relaxed">
                {o.explicacao}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      {estado.ok && <p className="text-success-fg text-sm">{estado.ok}</p>}
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar regra
        </Button>
      </div>
    </form>
  )
}
