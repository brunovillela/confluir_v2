"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SenhaNova } from "@/components/auth/senha-nova"
import { redefinirSenha } from "@/lib/actions/sessao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

export function DefinirSenhaForm({ destino }: { destino: string }) {
  const [estado, formAction, pendente] = useActionState(redefinirSenha, {})
  const envio = useEnvioFormulario(formAction, estado)

  if (estado.ok) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Senha definida</CardTitle>
          <CardDescription>
            Sua senha foi salva. Você já pode acessar o sistema.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href={destino}>Continuar</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Definir senha</CardTitle>
        <CardDescription>
          Escolha a sua senha de acesso.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} {...envio} className="grid gap-4">
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <SenhaNova rotulo="Nova senha" />
          <Button type="submit" disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            Salvar senha
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
