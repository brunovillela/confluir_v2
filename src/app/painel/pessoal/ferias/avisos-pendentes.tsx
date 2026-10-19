"use client"

import { useActionState } from "react"
import { FileSignature, Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"

import { enviarAvisosPendentesAction } from "./actions"

/**
 * Gozos autorizados antes do aviso eletrônico existir (e que ainda vão
 * começar): um clique envia o aviso de cada um para o funcionário assinar.
 */
export function AvisosPendentes({ quantidade }: { quantidade: number }) {
  const [estado, acao, pendente] = useActionState(enviarAvisosPendentesAction, {})
  if (quantidade === 0 && !estado.ok && !estado.erro) return null
  return (
    <Alert className="border-primary/30">
      <FileSignature />
      <AlertDescription className="grid gap-2">
        {quantidade > 0 && (
          <span>
            <strong>{quantidade}</strong> gozo(s) autorizado(s), ainda por começar, sem aviso de férias enviado para
            assinatura do funcionário.
          </span>
        )}
        {estado.ok && <span className="text-success-fg">{estado.ok}</span>}
        {estado.erro && <span className="text-destructive">{estado.erro}</span>}
        {quantidade > 0 && (
          <form
            action={acao}
            onSubmit={(e) =>
              confirmarEnvio(
                e,
                `Enviar o aviso de férias de ${quantidade} gozo(s)? Cada funcionário recebe um e-mail com o link para ler e assinar.`
              )
            }
          >
            <Button type="submit" size="sm" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <FileSignature />}
              Enviar avisos para assinatura
            </Button>
          </form>
        )}
      </AlertDescription>
    </Alert>
  )
}
