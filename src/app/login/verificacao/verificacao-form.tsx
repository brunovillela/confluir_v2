"use client"

import { useActionState } from "react"
import { Loader2, ShieldCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { verificarSegundoFator } from "./actions"

export function VerificacaoForm({ fatorId, next }: { fatorId: string; next: string }) {
  const [estado, acao, pendente] = useActionState(verificarSegundoFator, {})
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="text-muted-foreground size-5" />
          Verificação em duas etapas
        </CardTitle>
        <CardDescription>
          Abra o aplicativo autenticador no seu celular e digite o código de 6 dígitos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={acao} className="grid gap-4">
          <input type="hidden" name="fator_id" value={fatorId} />
          <input type="hidden" name="next" value={next} />
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2">
            <Label htmlFor="codigo">Código</Label>
            <Input
              id="codigo"
              name="codigo"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              required
              autoFocus
              className="text-center text-lg tracking-[0.4em]"
            />
          </div>
          <Button type="submit" disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            Confirmar
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
