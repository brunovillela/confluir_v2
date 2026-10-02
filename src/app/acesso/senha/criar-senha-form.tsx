"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { criarSenhaPeloLink } from "./actions"

export function CriarSenhaForm({
  tokenHash,
  tipo,
  destino,
}: {
  tokenHash: string
  tipo: string
  destino: string | null
}) {
  const [estado, acao, pendente] = useActionState(criarSenhaPeloLink, {})
  return (
    <Card>
      <CardHeader>
        <CardTitle>{tipo === "recovery" ? "Crie uma nova senha" : "Crie sua senha"}</CardTitle>
        <CardDescription>
          Escolha uma senha com pelo menos 8 caracteres. Ao salvar, você já entra no sistema.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={acao} className="grid gap-4">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={tipo} />
          {destino && <input type="hidden" name="destino" value={destino} />}
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2">
            <Label htmlFor="senha">Senha</Label>
            <Input id="senha" name="senha" type="password" autoComplete="new-password" minLength={8} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmacao">Confirmar senha</Label>
            <Input
              id="confirmacao"
              name="confirmacao"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>
          <Button type="submit" disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            Salvar senha e entrar
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
