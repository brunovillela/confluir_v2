"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { SenhaNova } from "@/components/auth/senha-nova"

import { criarSenhaPeloLink } from "./actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

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
  const envio = useEnvioFormulario(acao, estado)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{tipo === "recovery" ? "Crie uma nova senha" : "Crie sua senha"}</CardTitle>
        <CardDescription>
          Escolha a sua senha. Ao salvar, você já entra no sistema.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={acao} {...envio} className="grid gap-4">
          <input type="hidden" name="token_hash" value={tokenHash} />
          <input type="hidden" name="type" value={tipo} />
          {destino && <input type="hidden" name="destino" value={destino} />}
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <SenhaNova />
          <Button type="submit" disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            Salvar senha e entrar
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
