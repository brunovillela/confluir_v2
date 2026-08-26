"use client"

import { useState } from "react"
import { useActionState } from "react"
import { Ban, Check, Loader2, Send, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

import {
  autorizarCusteioAction,
  cancelarCusteioAction,
  reprovarCusteioAction,
  submeterCusteioAction,
} from "../actions"

export function BotaoSubmeter({ custeioId }: { custeioId: string }) {
  const [estado, formAction, pendente] = useActionState(
    submeterCusteioAction,
    {}
  )
  return (
    <form action={formAction}>
      <input type="hidden" name="custeio_id" value={custeioId} />
      {estado.erro && (
        <Alert variant="destructive" className="mb-2">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Send />}
        Submeter para autorização
      </Button>
    </form>
  )
}

export function BotaoAutorizar({ custeioId }: { custeioId: string }) {
  const [estado, formAction, pendente] = useActionState(
    autorizarCusteioAction,
    {}
  )
  return (
    <form action={formAction}>
      <input type="hidden" name="custeio_id" value={custeioId} />
      {estado.erro && (
        <Alert variant="destructive" className="mb-2">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Check />}
        Autorizar e gerar ordens
      </Button>
    </form>
  )
}

export function FormReprovar({ custeioId }: { custeioId: string }) {
  const [estado, formAction, pendente] = useActionState(
    reprovarCusteioAction,
    {}
  )
  const [aberto, setAberto] = useState(false)

  if (!aberto) {
    return (
      <Button variant="outline" onClick={() => setAberto(true)}>
        <X />
        Reprovar
      </Button>
    )
  }
  return (
    <form action={formAction} className="grid max-w-md gap-2">
      <input type="hidden" name="custeio_id" value={custeioId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <Textarea
        name="motivo_reprovacao"
        rows={2}
        required
        placeholder="Motivo da reprovação"
      />
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Confirmar reprovação
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

export function BotaoCancelar({ custeioId }: { custeioId: string }) {
  const [estado, formAction, pendente] = useActionState(
    cancelarCusteioAction,
    {}
  )
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Cancelar este custeio?")) e.preventDefault()
      }}
    >
      <input type="hidden" name="custeio_id" value={custeioId} />
      {estado.erro && (
        <Alert variant="destructive" className="mb-2">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Ban className="text-destructive size-4" />
        )}
        Cancelar
      </Button>
    </form>
  )
}
