"use client"

import { useActionState } from "react"
import { Loader2, Undo2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { type EstadoForm } from "@/lib/contas"

import { restaurarCopiaAction } from "./duplicidades/actions"

/** Devolve uma cópia descartada à lista de CATs. */
export function RestaurarCopia({ id }: { id: string }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(async (prev, formData) => {
    const r = await restaurarCopiaAction(prev, formData)
    if (r.ok) toast.success(r.ok)
    return r
  }, {})
  if (estado.ok) return <span className="text-success-fg text-xs">{estado.ok}</span>
  return (
    <form action={acao} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" size="sm" variant="ghost" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Undo2 />}
        Restaurar
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}
