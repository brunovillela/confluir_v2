"use client"

import { useActionState, useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"

import { CampoCpf } from "@/components/auth/campo-cpf"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { confirmarTokenEleitor, solicitarTokenEleitor } from "./actions"

export function VotarForm({ assembleiaId }: { assembleiaId: string }) {
  const [cpf, setCpf] = useState("")
  const [estadoToken, actionToken, pendenteToken] = useActionState(
    async (prev: { erro?: string; ok?: string }, formData: FormData) => {
      setCpf(String(formData.get("cpf") ?? ""))
      return solicitarTokenEleitor(prev, formData)
    },
    {}
  )
  const [estadoConfirma, actionConfirma, pendenteConfirma] = useActionState(
    confirmarTokenEleitor,
    {}
  )

  if (estadoConfirma.ok === "autenticado") {
    return (
      <Card>
        <CardHeader className="items-center text-center">
          <CheckCircle2 className="mx-auto size-10 text-success-fg" />
          <CardTitle className="pt-2">Identidade confirmada</CardTitle>
          <CardDescription>
            Você está habilitado a votar. A cédula de votação será liberada
            quando o módulo de assembleias entrar no ar (Fase 3D).
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const aguardandoCodigo = Boolean(estadoToken.ok)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Votação online</CardTitle>
        <CardDescription>
          {aguardandoCodigo
            ? "Digite o código de 6 dígitos enviado ao seu email."
            : "Identifique-se com seu CPF para receber o código de acesso."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!aguardandoCodigo ? (
          <form action={actionToken} className="grid gap-4">
            <input type="hidden" name="assembleia_id" value={assembleiaId} />
            {estadoToken.erro && (
              <Alert variant="destructive">
                <AlertDescription>{estadoToken.erro}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label htmlFor="cpf">CPF</Label>
              <CampoCpf id="cpf" name="cpf" required />
            </div>
            <Button type="submit" disabled={pendenteToken}>
              {pendenteToken && <Loader2 className="animate-spin" />}
              Receber código
            </Button>
          </form>
        ) : (
          <form action={actionConfirma} className="grid gap-4">
            <input type="hidden" name="cpf" value={cpf} />
            <Alert>
              <AlertDescription>{estadoToken.ok}</AlertDescription>
            </Alert>
            {estadoConfirma.erro && (
              <Alert variant="destructive">
                <AlertDescription>{estadoConfirma.erro}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label htmlFor="token">Código de verificação</Label>
              <Input
                id="token"
                name="token"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="000000"
                className="text-center text-lg tracking-[0.5em]"
                required
              />
            </div>
            <Button type="submit" disabled={pendenteConfirma}>
              {pendenteConfirma && <Loader2 className="animate-spin" />}
              Confirmar
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
