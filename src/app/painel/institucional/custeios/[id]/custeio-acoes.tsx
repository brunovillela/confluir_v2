"use client"

import { useState } from "react"
import { useActionState } from "react"
import { Ban, Check, Loader2, RotateCcw, Send, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

import {
  autorizarCusteioAction,
  cancelarCusteioAction,
  reabrirCusteioAction,
  reprovarCusteioAction,
  submeterCusteioAction,
} from "../actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"

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

/** Reprovado → rascunho, para corrigir e submeter de novo. */
export function BotaoReabrir({ custeioId }: { custeioId: string }) {
  const [estado, formAction, pendente] = useActionState(
    reabrirCusteioAction,
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
      <Button type="submit" variant="outline" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <RotateCcw />}
        Reabrir para correção
      </Button>
    </form>
  )
}

/**
 * Cancela o custeio com motivo. `ordensAbertas` > 0 (custeio autorizado): as
 * ordens ainda não pagas são canceladas junto no Financeiro.
 */
export function BotaoCancelar({
  custeioId,
  ordensAbertas = 0,
}: {
  custeioId: string
  ordensAbertas?: number
}) {
  const [estado, formAction, pendente] = useActionState(
    cancelarCusteioAction,
    {}
  )
  const [aberto, setAberto] = useState(false)

  if (!aberto) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <Ban className="text-destructive size-4" />
        Cancelar custeio
      </Button>
    )
  }
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (ordensAbertas > 0) {
          confirmarEnvio(
            e,
            `Cancelar este custeio? ${ordensAbertas} ordem(ns) ainda não paga(s) será(ão) cancelada(s) no Financeiro.`
          )
        }
      }}
      className="grid max-w-md gap-2"
    >
      <input type="hidden" name="custeio_id" value={custeioId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {ordensAbertas > 0 && (
        <p className="text-muted-foreground text-xs">
          As {ordensAbertas} ordem(ns) ainda não paga(s) serão canceladas junto.
          As já pagas continuam como estão.
        </p>
      )}
      <Textarea
        name="motivo"
        rows={2}
        required
        placeholder="Motivo do cancelamento"
      />
      <div className="flex gap-2">
        <Button type="submit" variant="destructive" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Confirmar cancelamento
        </Button>
        <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
          Voltar
        </Button>
      </div>
    </form>
  )
}
