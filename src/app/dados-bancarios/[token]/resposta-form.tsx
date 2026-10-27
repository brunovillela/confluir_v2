"use client"

import { useActionState } from "react"
import { CheckCircle2, Loader2, Send } from "lucide-react"

import { CamposDadosBancarios } from "@/components/dados-bancarios-campos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

import { responderPedidoAction, type EstadoResposta } from "./actions"

/** Formulário do favorecido: chave Pix e/ou conta, no próprio CPF/CNPJ. */
export function RespostaForm({ token }: { token: string }) {
  const [estado, formAction, pendente] = useActionState<EstadoResposta, FormData>(responderPedidoAction, {})
  const envio = useEnvioFormulario(formAction, estado)

  if (estado.ok) {
    return (
      <Alert className="border-success/40 text-success-fg">
        <CheckCircle2 />
        <AlertDescription>Recebemos seus dados bancários. Obrigado! Você já pode fechar esta página.</AlertDescription>
      </Alert>
    )
  }

  return (
    <form action={formAction} {...envio} className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <CamposDadosBancarios prefixo="pedido" valores={null} semFavorecido />
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Send />}
          Enviar dados bancários
        </Button>
      </div>
    </form>
  )
}
