"use client"

import { useActionState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { EstadoForm } from "@/lib/contas"

type Props = {
  titulo: string
  descricao: string
  rotuloBotao: string
  action: (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>
  voltarHref?: string
}

/** Formulário genérico de um campo de email (primeiro acesso, recuperação de senha). */
export function FormEmail({
  titulo,
  descricao,
  rotuloBotao,
  action,
  voltarHref = "/login",
}: Props) {
  const [estado, formAction, pendente] = useActionState(action, {})

  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>{descricao}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          {estado.ok && (
            <Alert>
              <AlertDescription>{estado.ok}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="voce@exemplo.com.br"
              required
            />
          </div>
          <Button type="submit" disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            {rotuloBotao}
          </Button>
        </form>
      </CardContent>
      <CardFooter>
        <Button variant="ghost" size="sm" asChild className="mx-auto">
          <Link href={voltarHref}>
            <ArrowLeft />
            Voltar ao login
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}
