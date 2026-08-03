"use client"

import { useActionState, useState } from "react"
import { Check, Loader2, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { avaliarOrdemAction } from "./actions"

/** Aprovar libera a ordem para pagamento; devolver exige o motivo. */
export function AvaliacaoOrdemForm({
  ordemId,
  valorTexto,
}: {
  ordemId: string
  valorTexto: string
}) {
  const [estado, formAction, pendente] = useActionState(avaliarOrdemAction, {})
  const [observacao, setObservacao] = useState("")

  return (
    <form
      action={formAction}
      className="grid gap-2"
      onSubmit={(e) => {
        const decisao = (
          (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement
        )?.value
        if (decisao === "aprovar") {
          if (!confirm(`Aprovar esta ordem de ${valorTexto} para pagamento?`)) {
            e.preventDefault()
          }
        } else if (!observacao.trim()) {
          alert("Informe o motivo da devolução.")
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="ordem_id" value={ordemId} />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="observacao"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Observação (obrigatória para devolver)"
          className="h-8 max-w-72 text-sm"
        />
        <Button
          type="submit"
          name="decisao"
          value="devolver"
          variant="outline"
          size="sm"
          disabled={pendente}
        >
          {pendente ? <Loader2 className="animate-spin" /> : <Undo2 />}
          Devolver
        </Button>
        <Button
          type="submit"
          name="decisao"
          value="aprovar"
          size="sm"
          disabled={pendente}
        >
          {pendente ? <Loader2 className="animate-spin" /> : <Check />}
          Aprovar
        </Button>
      </div>
      {estado.erro && (
        <span className="text-destructive text-xs">{estado.erro}</span>
      )}
    </form>
  )
}
