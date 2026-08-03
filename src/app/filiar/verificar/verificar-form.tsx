"use client"

import { useActionState } from "react"
import { Loader2, ShieldCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { reenviarCodigoAction, verificarCodigoAction } from "../actions"

export function VerificarForm({ token }: { token: string }) {
  const [estado, formAction, pendente] = useActionState(verificarCodigoAction, {})
  const [reenvio, reenviarAction, reenviando] = useActionState(
    reenviarCodigoAction,
    {}
  )

  return (
    <Card>
      <CardContent className="grid gap-4">
        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="token" value={token} />
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          {reenvio.ok && (
            <Alert className="border-success/40 text-success-fg">
              <AlertDescription>{reenvio.ok}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="codigo">Código de verificação</Label>
            <Input
              id="codigo"
              name="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
              className="text-center text-lg tracking-[0.5em]"
              required
            />
          </div>
          <Button type="submit" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
            Confirmar e-mail
          </Button>
        </form>

        <form action={reenviarAction} className="text-center">
          <input type="hidden" name="token" value={token} />
          <Button
            type="submit"
            variant="link"
            size="sm"
            disabled={reenviando}
            className="text-muted-foreground h-auto"
          >
            {reenviando ? "Reenviando…" : "Não recebeu? Reenviar código"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
