"use client"

import { useActionState, useState } from "react"
import { Check, Loader2, Undo2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import { avaliarOrdemAction } from "./actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

/** Aprovar libera a ordem para pagamento; devolver exige o motivo. */
export function AvaliacaoOrdemForm({
  ordemId,
  valorTexto,
  voltarPara,
}: {
  ordemId: string
  valorTexto: string
  /** Tela para onde volta depois de avaliar (padrão: Avaliações de ordens). */
  voltarPara?: string
}) {
  const [estado, formAction, pendente] = useActionState(avaliarOrdemAction, {})
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) => {
        const decisao = (
          (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement
        )?.value
        if (decisao === "aprovar") {
          confirmarEnvio(e, `Aprovar esta ordem de ${valorTexto} para pagamento?`)
        } else if (!observacao.trim()) {
          alert("Informe o motivo da devolução.")
          e.preventDefault()
        }
      },
  })
  const [observacao, setObservacao] = useState("")

  return (
    <form
      action={formAction} {...envio}
      className="grid w-full min-w-0 gap-2 sm:w-auto"
    >
      <input type="hidden" name="ordem_id" value={ordemId} />
      {voltarPara && <input type="hidden" name="voltar" value={voltarPara} />}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="observacao"
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Observação (obrigatória para devolver)"
          className="h-8 w-full text-sm sm:w-72"
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
