"use client"

import { useActionState, useState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { cadastrarNaoFiliado, loginNaoFiliado } from "./actions"

export function AcessoNaoFiliado() {
  const [aba, setAba] = useState<"login" | "cadastro">("login")
  const [estadoLogin, acaoLogin, pendLogin] = useActionState(
    loginNaoFiliado,
    {}
  )
  const [estadoCad, acaoCad, pendCad] = useActionState(cadastrarNaoFiliado, {})

  return (
    <div className="grid gap-4">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={aba === "login" ? "default" : "outline"}
          size="sm"
          onClick={() => setAba("login")}
        >
          Já tenho cadastro
        </Button>
        <Button
          type="button"
          variant={aba === "cadastro" ? "default" : "outline"}
          size="sm"
          onClick={() => setAba("cadastro")}
        >
          Criar cadastro
        </Button>
      </div>

      {aba === "login" ? (
        <form action={acaoLogin} className="grid gap-3">
          {estadoLogin.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estadoLogin.erro}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="login_cpf">CPF</Label>
            <Input id="login_cpf" name="cpf" inputMode="numeric" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="login_senha">Senha</Label>
            <Input id="login_senha" name="senha" type="password" required />
          </div>
          <Button type="submit" disabled={pendLogin}>
            {pendLogin && <Loader2 className="animate-spin" />}
            Entrar
          </Button>
        </form>
      ) : (
        <form action={acaoCad} className="grid gap-3">
          {estadoCad.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estadoCad.erro}</AlertDescription>
            </Alert>
          )}
          {estadoCad.ok && (
            <Alert className="border-success/40 text-success-fg">
              <AlertDescription>{estadoCad.ok}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="cad_cpf">CPF</Label>
            <Input id="cad_cpf" name="cpf" inputMode="numeric" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cad_nome">Nome completo</Label>
            <Input id="cad_nome" name="nome" required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="cad_email">E-mail</Label>
              <Input id="cad_email" name="email" type="email" required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cad_telefone">Telefone</Label>
              <Input id="cad_telefone" name="telefone" inputMode="tel" />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="cad_nascimento">Nascimento</Label>
              <input
                id="cad_nascimento"
                name="nascimento"
                type="date"
                className="border-input bg-background h-9 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cad_senha">Senha (mín. 6)</Label>
              <Input id="cad_senha" name="senha" type="password" required />
            </div>
          </div>
          <Button type="submit" disabled={pendCad}>
            {pendCad && <Loader2 className="animate-spin" />}
            Criar cadastro e entrar
          </Button>
        </form>
      )}
    </div>
  )
}
