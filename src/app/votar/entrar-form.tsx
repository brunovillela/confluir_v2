"use client"

import { useActionState, useState } from "react"
import { Loader2, Mail } from "lucide-react"

import { Turnstile } from "@/components/auth/turnstile"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EstadoForm } from "@/lib/contas"

import { confirmarCodigoLinkUnico, solicitarCodigoLinkUnico } from "./actions"

/**
 * Passo 1 do link único: confirmar um e-mail que a pessoa RECEBE. O código sai
 * pelo canal do app; o e-mail também traz um botão que entra direto.
 */
export function EntrarForm() {
  const [email, setEmail] = useState("")
  const [pedido, pedir, pedindo] = useActionState(
    async (prev: EstadoForm, formData: FormData) => {
      setEmail(String(formData.get("email") ?? ""))
      return solicitarCodigoLinkUnico(prev, formData)
    },
    {}
  )
  const [conf, confirmar, confirmando] = useActionState(confirmarCodigoLinkUnico, {})
  const aguardandoCodigo = Boolean(pedido.ok)

  if (aguardandoCodigo) {
    return (
      <form action={confirmar} className="grid gap-4">
        <input type="hidden" name="email" value={email} />
        <Alert>
          <AlertDescription>{pedido.ok}</AlertDescription>
        </Alert>
        {conf.erro && (
          <Alert variant="destructive">
            <AlertDescription>{conf.erro}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-2">
          <Label htmlFor="token">Código de verificação</Label>
          <Input
            id="token"
            name="token"
            inputMode="numeric"
            pattern="\d{6,10}"
            maxLength={10}
            placeholder="Código"
            className="text-center text-lg tracking-[0.4em]"
            autoComplete="one-time-code"
            required
          />
        </div>
        <Button type="submit" disabled={confirmando}>
          {confirmando && <Loader2 className="animate-spin" />}
          Confirmar
        </Button>
        <p className="text-muted-foreground text-xs">
          Não chegou? Confira o lixo eletrônico e a aba Promoções. Se preferir, recarregue a página e use outro
          e-mail.
        </p>
      </form>
    )
  }

  return (
    <form action={pedir} className="grid gap-4">
      {pedido.erro && (
        <Alert variant="destructive">
          <AlertDescription>{pedido.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-2">
        <Label htmlFor="email">Seu e-mail</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
        <p className="text-muted-foreground text-xs">
          Use um e-mail que você recebe — de preferência o pessoal (Gmail, por exemplo). E-mails de empresa
          costumam barrar as nossas mensagens.
        </p>
      </div>
      <Turnstile acao="votacao_link_unico" />
      <Button type="submit" disabled={pedindo}>
        {pedindo ? <Loader2 className="animate-spin" /> : <Mail />}
        Receber código
      </Button>
    </form>
  )
}
