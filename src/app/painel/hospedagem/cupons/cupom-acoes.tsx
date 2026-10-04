"use client"

import { useActionState } from "react"
import { Loader2, Mail, X } from "lucide-react"

import { Button } from "@/components/ui/button"

import { CopiarLinkBotao } from "@/components/copiar-link"

import { cancelarCupom, linkDaReservaAction, reenviarConfirmacaoReservaAction } from "./actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"

/** Cancelamento do cupom, com confirmação. Erros aparecem como alerta nativo. */
export function CancelarCupomBotao({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(cancelarCupom, {})

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        confirmarEnvio(e, "Cancelar este cupom? A ação não pode ser desfeita.")
      }}
    >
      <input type="hidden" name="id" value={id} />
      {estado.erro && (
        <span className="text-destructive mr-2 text-xs">{estado.erro}</span>
      )}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        className="text-destructive hover:text-destructive h-7 px-2"
      >
        {pendente ? <Loader2 className="animate-spin" /> : <X />}
        Cancelar
      </Button>
    </form>
  )
}

/** Reserva garantida: reenviar o e-mail de confirmação ou copiar o link direto. */
export function AcoesReservaGarantida({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(reenviarConfirmacaoReservaAction, {})
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <form action={formAction}>
        <input type="hidden" name="id" value={id} />
        <Button
          type="submit"
          variant="ghost"
          size="sm"
          disabled={pendente}
          className="h-7 px-2"
          title="Reenviar o e-mail de confirmação da reserva"
        >
          {pendente ? <Loader2 className="animate-spin" /> : <Mail />}
          Reenviar e-mail
        </Button>
      </form>
      <CopiarLinkBotao obterLink={() => linkDaReservaAction(id)} />
      {(estado.erro || estado.ok) && (
        <span className={`basis-full text-xs ${estado.erro ? "text-destructive" : "text-success-fg"}`}>
          {estado.erro ?? estado.ok}
        </span>
      )}
    </span>
  )
}
