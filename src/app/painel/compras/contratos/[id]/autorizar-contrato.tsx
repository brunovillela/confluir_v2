"use client"

import { useActionState } from "react"
import { BadgeCheck, Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"

import { autorizarContratoAction } from "../actions"

/** Botão de autorizar o contrato (permissão "Contratos — autorizar"). */
export function AutorizarContrato({ contratoId }: { contratoId: string }) {
  const [estado, acao, pendente] = useActionState(autorizarContratoAction, {})
  return (
    <form
      action={acao}
      onSubmit={(e) =>
        confirmarEnvio(e, {
          titulo: "Autorizar este contrato?",
          descricao:
            "As parcelas recorrentes passam a nascer autorizadas e esperam só o documento fiscal; com a nota no valor autorizado, seguem direto para pagamento. Pagamentos extraordinários continuam passando pela autorização pontual.",
          confirmar: "Autorizar",
        })
      }
      className="grid gap-2"
    >
      <input type="hidden" name="contrato_id" value={contratoId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" size="sm" disabled={pendente} className="justify-self-start">
        {pendente ? <Loader2 className="animate-spin" /> : <BadgeCheck />}
        Autorizar contrato
      </Button>
    </form>
  )
}
