"use client"

import { useActionState } from "react"
import { Loader2, LockKeyhole, LockKeyholeOpen } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

import { fecharInscricoesAction, reabrirInscricoesAction } from "../actions"

/**
 * Fechar / reabrir as inscrições à mão (26/11/2026). Fechar pergunta antes:
 * quem ainda não se inscreveu perde o caminho. Reabrir também confirma, mas
 * sem tom de alerta — é desfazer o fechamento.
 */
export function FecharInscricoesForm({ eventoId }: { eventoId: string }) {
  const [estado, formAction, pendente] = useActionState(fecharInscricoesAction, {})
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) =>
      confirmarEnvio(e, {
        titulo: "Fechar as inscrições?",
        descricao:
          "As pessoas não conseguirão mais se inscrever — nem pelo link público, nem pelo portal do associado. Quem já se inscreveu continua inscrito, e a reserva de convidados pela equipe segue possível. Enquanto o prazo de inscrição configurado não terminar, dá para reabrir.",
        confirmar: "Fechar inscrições",
        destrutivo: true,
      }),
  })

  return (
    <form action={formAction} {...envio} className="grid gap-2">
      <input type="hidden" name="id" value={eventoId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <LockKeyhole />}
          Fechar inscrições
        </Button>
      </div>
    </form>
  )
}

export function ReabrirInscricoesForm({ eventoId }: { eventoId: string }) {
  const [estado, formAction, pendente] = useActionState(reabrirInscricoesAction, {})
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) =>
      confirmarEnvio(e, {
        titulo: "Reabrir as inscrições?",
        descricao:
          "O link público e o portal do associado voltam a aceitar inscrições, dentro do prazo e das vagas configurados.",
        confirmar: "Reabrir inscrições",
        destrutivo: false,
      }),
  })

  return (
    <form action={formAction} {...envio} className="grid gap-2">
      <input type="hidden" name="id" value={eventoId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <LockKeyholeOpen />}
          Reabrir inscrições
        </Button>
      </div>
    </form>
  )
}
