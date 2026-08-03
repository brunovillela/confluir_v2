"use client"

import { useActionState, useState } from "react"
import { Check, Loader2, Phone } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"

import {
  confirmarCodigoTelefoneAction,
  solicitarCodigoTelefoneAction,
} from "./actions"

/** Dígitos → (21) 99999-9999 / (21) 9999-9999; ignora +55 se vier. */
function formatarTelefone(valor: string | null): string {
  const d = (valor ?? "").replace(/\D/g, "")
  const nac = d.length > 11 ? d.slice(-11) : d
  if (nac.length === 11)
    return `(${nac.slice(0, 2)}) ${nac.slice(2, 7)}-${nac.slice(7)}`
  if (nac.length === 10)
    return `(${nac.slice(0, 2)}) ${nac.slice(2, 6)}-${nac.slice(6)}`
  return valor ?? "—"
}

export function TelegramTelefone({
  telefone,
  pendente,
}: {
  telefone: string | null
  pendente: string | null
}) {
  const [trocar, setTrocar] = useState(false)
  const [enviar, enviarAction, enviando] = useActionState(
    solicitarCodigoTelefoneAction,
    {}
  )
  const [confirmar, confirmarAction, confirmando] = useActionState(
    confirmarCodigoTelefoneAction,
    {}
  )

  const aguardando = Boolean(pendente) && !trocar
  const confirmado = Boolean(telefone) && !aguardando && !trocar

  if (confirmado) {
    return (
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-success/40 text-success-fg">
            Telefone confirmado
          </Badge>
          <span className="text-sm font-medium">
            {formatarTelefone(telefone)}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-fit"
          onClick={() => setTrocar(true)}
        >
          Trocar telefone
        </Button>
      </div>
    )
  }

  if (aguardando) {
    return (
      <div className="grid gap-3">
        <p className="text-muted-foreground text-sm">
          Enviei um código para o seu Telegram (número{" "}
          <b>{formatarTelefone(pendente)}</b>). Digite-o abaixo para confirmar. O
          código vale por 10 minutos.
        </p>
        {confirmar.erro && (
          <Alert variant="destructive">
            <AlertDescription>{confirmar.erro}</AlertDescription>
          </Alert>
        )}
        <form action={confirmarAction} className="flex flex-wrap gap-2">
          <Input
            name="codigo"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            required
            className="w-28 font-mono tracking-widest"
          />
          <Button type="submit" size="sm" disabled={confirmando}>
            {confirmando ? <Loader2 className="animate-spin" /> : <Check />}
            Confirmar
          </Button>
        </form>
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={() => setTrocar(true)}
        >
          Usar outro número
        </Button>
      </div>
    )
  }

  // Formulário do telefone (primeira vez ou "trocar").
  return (
    <div className="grid gap-3">
      <p className="text-muted-foreground text-sm">
        Informe seu telefone com DDD. Vou enviar um código ao seu Telegram para
        você confirmar aqui.
      </p>
      {enviar.erro && (
        <Alert variant="destructive">
          <AlertDescription>{enviar.erro}</AlertDescription>
        </Alert>
      )}
      <form action={enviarAction} className="flex flex-wrap gap-2">
        <Input
          name="telefone"
          inputMode="tel"
          placeholder="(21) 99999-9999"
          required
          className="max-w-52"
        />
        <Button type="submit" size="sm" disabled={enviando}>
          {enviando ? <Loader2 className="animate-spin" /> : <Phone />}
          Enviar código
        </Button>
      </form>
      {(telefone || pendente) && (
        <Button
          variant="ghost"
          size="sm"
          className="w-fit"
          onClick={() => setTrocar(false)}
        >
          Cancelar
        </Button>
      )}
    </div>
  )
}
