"use client"

import { useActionState, useState } from "react"
import { Check, Loader2, Undo2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { type EstadoForm } from "@/lib/contas"

import { aprovarOrdemCelularAction, avaliarDiariaCelularAction } from "./actions"

/**
 * Aprovar/devolver com o polegar: botões de 44px, observação só quando a
 * pessoa vai devolver, confirmação com o valor na pergunta.
 */
export function DecisaoForm({
  tipo,
  id,
  resumo,
  rotuloVoltar,
}: {
  tipo: "ordem" | "diaria"
  id: string
  /** Entra na pergunta de confirmação ("Aprovar a ordem de R$ 1.200,00?"). */
  resumo: string
  rotuloVoltar: string
}) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(
    tipo === "ordem" ? aprovarOrdemCelularAction : avaliarDiariaCelularAction,
    {}
  )
  const [devolvendo, setDevolvendo] = useState(false)

  if (estado.ok) {
    return (
      <Alert className="border-success/40 text-success-fg">
        <AlertDescription>{estado.ok}</AlertDescription>
      </Alert>
    )
  }

  return (
    <form
      action={action}
      className="grid gap-2"
      onSubmit={(e) => {
        const decisao = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value
        if (decisao === "aprovar") confirmarEnvio(e, `Aprovar ${resumo}?`)
      }}
    >
      <input type="hidden" name={tipo === "ordem" ? "ordem_id" : "id"} value={id} />
      <ErroNoCampo estado={estado} />
      {devolvendo && (
        <Input name="observacao" placeholder={`Motivo (obrigatório para ${rotuloVoltar.toLowerCase()})`} className="min-h-11" autoFocus />
      )}
      {estado.erro && !estado.campo && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-2 gap-2">
        {devolvendo ? (
          <Button type="submit" name="decisao" value="devolver" variant="outline" className="min-h-11" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <Undo2 />}
            Confirmar {rotuloVoltar.toLowerCase()}
          </Button>
        ) : (
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setDevolvendo(true)} disabled={pendente}>
            <Undo2 />
            {rotuloVoltar}
          </Button>
        )}
        <Button type="submit" name="decisao" value="aprovar" className="min-h-11" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Check />}
          Aprovar
        </Button>
      </div>
    </form>
  )
}
