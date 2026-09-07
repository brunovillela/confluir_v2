"use client"

import { useActionState } from "react"
import { Check, Loader2, UserPlus, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import {
  cancelarAction,
  inscreverAction,
  responderRsvpPortalAction,
} from "./actions"

function Recado({ erro, ok }: { erro?: string; ok?: string }) {
  if (!erro && !ok) return null
  return (
    <Alert variant={erro ? "destructive" : "success"}>
      <AlertDescription className="text-sm">{erro ?? ok}</AlertDescription>
    </Alert>
  )
}

export function Inscrever({ eventoId }: { eventoId: string }) {
  const [estado, formAction, pendente] = useActionState(inscreverAction, {})

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="eventoId" value={eventoId} />
      <Recado erro={estado.erro} ok={estado.ok} />
      {!estado.ok && (
        <div>
          <Button type="submit" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <UserPlus />}
            Quero participar
          </Button>
          <p className="text-muted-foreground mt-2 text-xs">
            Seus dados já estão com o sindicato — basta um toque.
          </p>
        </div>
      )}
    </form>
  )
}

export function ResponderRsvp({
  token,
  resposta,
}: {
  token: string
  resposta: boolean | null
}) {
  const [estado, formAction, pendente] = useActionState(
    responderRsvpPortalAction,
    {}
  )

  return (
    <div className="grid gap-2">
      <Recado erro={estado.erro} ok={estado.ok} />
      {resposta !== null && !estado.ok && (
        <p className="text-muted-foreground text-sm">
          Você respondeu que <strong>{resposta ? "vai" : "não vai"}</strong>{" "}
          comparecer. Pode mudar abaixo.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <form action={formAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="vem" value="sim" />
          <Button type="submit" size="sm" disabled={pendente}>
            <Check />
            Vou comparecer
          </Button>
        </form>
        <form action={formAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="vem" value="nao" />
          <Button type="submit" size="sm" variant="outline" disabled={pendente}>
            <X />
            Não vou poder ir
          </Button>
        </form>
      </div>
      <p className="text-muted-foreground text-xs">
        Avisar que não vai não é falta — é o que libera a vaga para outra
        pessoa.
      </p>
    </div>
  )
}

export function CancelarInscricao({ inscricaoId }: { inscricaoId: string }) {
  const [estado, formAction, pendente] = useActionState(cancelarAction, {})

  if (estado.ok) return <Recado ok={estado.ok} />

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="inscricaoId" value={inscricaoId} />
      <Recado erro={estado.erro} />
      <div>
        <Button type="submit" size="sm" variant="ghost" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : null}
          Cancelar minha inscrição
        </Button>
      </div>
    </form>
  )
}
