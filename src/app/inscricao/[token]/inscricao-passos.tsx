"use client"

import { useActionState } from "react"
import { Loader2, MailCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CampoCodigo } from "@/components/campo-codigo"
import { Label } from "@/components/ui/label"

import {
  confirmarEmailAction,
  reenviarCodigoAction,
  responderRsvpAction,
} from "./actions"

export function ConfirmarEmail({
  token,
  email,
}: {
  token: string
  email: string | null
}) {
  const [estado, formAction, pendente] = useActionState(confirmarEmailAction, {})
  const [estadoReenvio, reenviarAction, reenviando] = useActionState(
    reenviarCodigoAction,
    {}
  )

  return (
    <div className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estadoReenvio.ok && (
        <Alert>
          <AlertDescription>{estadoReenvio.ok}</AlertDescription>
        </Alert>
      )}
      {estadoReenvio.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estadoReenvio.erro}</AlertDescription>
        </Alert>
      )}

      <form action={formAction} className="grid gap-3">
        <input type="hidden" name="token" value={token} />
        <div className="grid gap-2">
          <Label htmlFor="codigo">Código de 6 dígitos</Label>
          <CampoCodigo autoFocus />
        </div>
        <p className="text-muted-foreground text-xs">
          Enviamos para {email ?? "seu e-mail"}. Confira também a caixa de spam.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <MailCheck />}
            Confirmar
          </Button>
        </div>
      </form>

      <form action={reenviarAction}>
        <input type="hidden" name="token" value={token} />
        <Button type="submit" variant="ghost" size="sm" disabled={reenviando}>
          {reenviando ? <Loader2 className="animate-spin" /> : null}
          Não recebi — enviar outro código
        </Button>
      </form>
    </div>
  )
}

export function RespostaRsvp({
  token,
  resposta,
}: {
  token: string
  resposta: boolean | null
}) {
  const [estado, formAction, pendente] = useActionState(responderRsvpAction, {})

  return (
    <div className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert variant="success">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}

      {resposta !== null && !estado.ok && (
        <p className="text-muted-foreground text-sm">
          Você respondeu que <strong>{resposta ? "vai" : "não vai"}</strong>{" "}
          comparecer. Pode mudar abaixo se precisar.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <form action={formAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="vem" value="sim" />
          <Button type="submit" disabled={pendente} variant="default">
            {pendente ? <Loader2 className="animate-spin" /> : null}
            Vou comparecer
          </Button>
        </form>
        <form action={formAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="vem" value="nao" />
          <Button type="submit" disabled={pendente} variant="outline">
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
