"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { enviarMagicLinkFiliado, loginFiliadoSenha } from "./actions"

function Mensagens({ erro, ok }: { erro?: string; ok?: string }) {
  if (erro) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{erro}</AlertDescription>
      </Alert>
    )
  }
  if (ok) {
    return (
      <Alert>
        <AlertDescription>{ok}</AlertDescription>
      </Alert>
    )
  }
  return null
}

export function PortalLoginForm() {
  const [estadoSenha, actionSenha, pendenteSenha] = useActionState(
    loginFiliadoSenha,
    {}
  )
  const [estadoLink, actionLink, pendenteLink] = useActionState(
    enviarMagicLinkFiliado,
    {}
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portal do Associado</CardTitle>
        <CardDescription>
          Acesse com seu CPF para consultar seus dados
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="link">
          <TabsList className="w-full">
            <TabsTrigger value="link" className="flex-1">
              Link por email
            </TabsTrigger>
            <TabsTrigger value="senha" className="flex-1">
              CPF e senha
            </TabsTrigger>
          </TabsList>

          <TabsContent value="link">
            <form action={actionLink} className="grid gap-4 pt-2">
              <Mensagens erro={estadoLink.erro} ok={estadoLink.ok} />
              <div className="grid gap-2">
                <Label htmlFor="cpf-link">CPF</Label>
                <CampoCpf id="cpf-link" name="cpf" required />
                <p className="text-muted-foreground text-xs">
                  Enviaremos um link de acesso ao email do seu cadastro.
                </p>
              </div>
              <Button type="submit" disabled={pendenteLink}>
                {pendenteLink && <Loader2 className="animate-spin" />}
                Enviar link de acesso
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="senha">
            <form action={actionSenha} className="grid gap-4 pt-2">
              <Mensagens erro={estadoSenha.erro} ok={estadoSenha.ok} />
              <div className="grid gap-2">
                <Label htmlFor="cpf-senha">CPF</Label>
                <CampoCpf id="cpf-senha" name="cpf" required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="senha">Senha</Label>
                <Input
                  id="senha"
                  name="senha"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <Button type="submit" disabled={pendenteSenha}>
                {pendenteSenha && <Loader2 className="animate-spin" />}
                Entrar
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
