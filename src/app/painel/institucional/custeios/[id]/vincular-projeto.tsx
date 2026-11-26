"use client"

import { useActionState } from "react"
import { FolderKanban, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { type EstadoForm } from "@/lib/contas"

import { vincularProjetoCusteioAction } from "../actions"

const SELECT =
  "border-input bg-background focus-visible:ring-ring/50 h-9 min-w-0 flex-1 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"

/** Liga o custeio (sem projeto) a um projeto em andamento. */
export function VincularProjetoCusteio({
  custeioId,
  projetos,
}: {
  custeioId: string
  projetos: { id: string; titulo: string }[]
}) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(vincularProjetoCusteioAction, {})
  if (estado.ok) return <p className="text-success-fg text-sm">{estado.ok}</p>
  return (
    <form action={acao} className="grid gap-1.5">
      <input type="hidden" name="custeio_id" value={custeioId} />
      <label htmlFor="vincular-projeto" className="text-muted-foreground text-xs">
        Vincular a um projeto — as ordens do custeio entram no gasto dele
      </label>
      <div className="flex flex-wrap gap-2">
        <select id="vincular-projeto" name="projeto_id" required defaultValue="" className={SELECT}>
          <option value="" disabled>
            (selecione um projeto em andamento)
          </option>
          {projetos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.titulo}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm" disabled={pendente || projetos.length === 0}>
          {pendente ? <Loader2 className="animate-spin" /> : <FolderKanban />}
          Vincular
        </Button>
      </div>
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
    </form>
  )
}
