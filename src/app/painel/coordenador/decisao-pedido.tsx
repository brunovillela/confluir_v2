"use client"

import { useActionState, useState } from "react"
import { Check, Loader2, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { type EstadoForm } from "@/lib/contas"

/**
 * Decidir um pedido da equipe na área do coordenador. `recusar` ausente =
 * só aprovação (férias: desfazer fica com o Pessoal); recusar pede o motivo.
 */
export function DecisaoPedido({
  id,
  acao,
  pergunta,
  aprovar,
  recusar,
}: {
  id: string
  acao: (estado: EstadoForm, fd: FormData) => Promise<EstadoForm>
  /** Texto da confirmação ao aprovar. */
  pergunta: string
  aprovar: { valor: string; rotulo: string }
  recusar?: { valor: string; rotulo: string }
}) {
  const [estado, formAction, pendente] = useActionState(acao, {})
  const [motivo, setMotivo] = useState("")

  if (estado.ok) return <p className="text-success-fg text-xs font-medium">{estado.ok}</p>

  return (
    <form
      action={formAction}
      className="grid justify-items-end gap-1.5"
      onSubmit={(e) => {
        const valor = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value
        if (valor === aprovar.valor) confirmarEnvio(e, pergunta)
        else if (!motivo.trim()) {
          alert("Informe o motivo da recusa.")
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center justify-end gap-2">
        {recusar && (
          <Input
            name="motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (para recusar)"
            className="h-8 w-48 text-sm"
          />
        )}
        {recusar && (
          <Button type="submit" name="decisao" value={recusar.valor} variant="outline" size="sm" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <X />}
            {recusar.rotulo}
          </Button>
        )}
        <Button type="submit" name="decisao" value={aprovar.valor} size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Check />}
          {aprovar.rotulo}
        </Button>
      </div>
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
    </form>
  )
}
