"use client"

import { useActionState, useState } from "react"
import { KeyRound, Loader2, Mail } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Turnstile } from "@/components/auth/turnstile"

import { confirmarCodigoMesario, enviarCodigoMesario } from "./actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

export function LoginMesario() {
  const [email, setEmail] = useState("")
  const [enviado, setEnviado] = useState(false)
  const [estEnviar, actEnviar, pendEnviar] = useActionState(
    async (prev: { erro?: string; ok?: string }, fd: FormData) => {
      const r = await enviarCodigoMesario(prev, fd)
      if (r.ok) setEnviado(true)
      return r
    },
    {}
  )
  const envio1 = useEnvioFormulario(actEnviar, estEnviar)
  const [estConfirmar, actConfirmar, pendConfirmar] = useActionState(
    confirmarCodigoMesario,
    {}
  )
  const envio2 = useEnvioFormulario(actConfirmar, estConfirmar)

  return (
    <div className="grid gap-4">
      <form action={actEnviar} {...envio1} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="email">E-mail cadastrado</Label>
          <Input
            id="email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="voce@empresa.com.br"
          />
        </div>
        {estEnviar.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estEnviar.erro}</AlertDescription>
          </Alert>
        )}
        {estEnviar.ok && (
          <Alert className="border-success/40 text-success-fg">
            <AlertDescription>{estEnviar.ok}</AlertDescription>
          </Alert>
        )}
        <Turnstile acao="codigo_mesario" />
        <Button type="submit" disabled={pendEnviar}>
          {pendEnviar ? <Loader2 className="animate-spin" /> : <Mail />}
          {enviado ? "Reenviar código" : "Enviar código"}
        </Button>
      </form>

      {enviado && (
        <form action={actConfirmar} {...envio2} className="grid gap-3 border-t pt-4">
          <input type="hidden" name="email" value={email} />
          <div className="grid gap-1.5">
            <Label htmlFor="token">Código recebido por e-mail</Label>
            <Input
              id="token"
              name="token"
              inputMode="numeric"
              maxLength={10}
              required
              placeholder="Código"
            />
          </div>
          {estConfirmar.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estConfirmar.erro}</AlertDescription>
            </Alert>
          )}
          <Button type="submit" disabled={pendConfirmar}>
            {pendConfirmar ? <Loader2 className="animate-spin" /> : <KeyRound />}
            Entrar
          </Button>
        </form>
      )}
    </div>
  )
}
