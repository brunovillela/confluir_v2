"use client"

import { useActionState } from "react"
import { Check, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { type EstadoForm } from "@/lib/contas"

import { usarComoContatoAction } from "../actions"

/** Um contato já cadastrado da empresa, sugerido como contato da folha. */
export function UsarContato({
  empresaId,
  contato,
}: {
  empresaId: string
  contato: { id: string; nome: string; cargo: string | null; email: string | null; telefone: string | null; daEmpresa: string }
}) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(usarComoContatoAction, {})
  return (
    <form action={acao} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-sm">
      <input type="hidden" name="empresa_id" value={empresaId} />
      <input type="hidden" name="contato_id" value={contato.id} />
      <span className="min-w-0">
        <span className="font-medium">{contato.nome}</span>
        {contato.cargo && <span className="text-muted-foreground"> · {contato.cargo}</span>}
        <span className="text-muted-foreground block text-xs">
          {[contato.email, contato.telefone].filter(Boolean).join(" · ") || "sem e-mail nem telefone"} · cadastrado em{" "}
          {contato.daEmpresa}
        </span>
      </span>
      <span className="flex items-center gap-2">
        {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
        <Button type="submit" size="sm" variant="outline" disabled={pendente || (!contato.email && !contato.telefone)}>
          {pendente ? <Loader2 className="animate-spin" /> : <Check />}
          Usar como contato da folha
        </Button>
      </span>
    </form>
  )
}
