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
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { loginFuncionario } from "./actions"

const MENSAGENS_ERRO: Record<string, string> = {
  sem_vinculo:
    "Sua conta não está vinculada a um funcionário. Filiados devem usar o Portal do Associado.",
  link_invalido: "O link de acesso é inválido ou expirou. Faça login ou solicite um novo.",
}

export function LoginForm({
  next,
  erroInicial,
}: {
  next?: string
  erroInicial?: string
}) {
  const [estado, formAction, pendente] = useActionState(loginFuncionario, {})
  const erro =
    estado.erro ?? (erroInicial ? MENSAGENS_ERRO[erroInicial] : undefined)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar no painel</CardTitle>
        <CardDescription>
          Acesso para funcionários do sindicato
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          {next && <input type="hidden" name="next" value={next} />}
          {erro && (
            <Alert variant="destructive">
              <AlertDescription>{erro}</AlertDescription>
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
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="senha">Senha</Label>
              <Link
                href="/login/recuperar-senha"
                className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
              >
                Esqueci minha senha
              </Link>
            </div>
            <Input
              id="senha"
              name="senha"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <Button type="submit" disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            Entrar
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-sm">
        <span className="text-muted-foreground">
          Primeiro acesso?{" "}
          <Link
            href="/login/primeiro-acesso"
            className="text-foreground font-medium underline-offset-4 hover:underline"
          >
            Ative sua conta
          </Link>
        </span>
      </CardFooter>
    </Card>
  )
}
