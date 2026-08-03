"use client"

import { useActionState } from "react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

import { loginHotel, recuperarSenhaHotel } from "./actions"

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

export function HotelLoginForm() {
  const [estadoLogin, actionLogin, pendenteLogin] = useActionState(loginHotel, {})
  const [estadoSenha, actionSenha, pendenteSenha] = useActionState(
    recuperarSenhaHotel,
    {}
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>Área do hotel parceiro</CardTitle>
        <CardDescription>
          Cupons e reservas de hospedagem do convênio com o sindicato
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="entrar">
          <TabsList className="w-full">
            <TabsTrigger value="entrar" className="flex-1">
              Entrar
            </TabsTrigger>
            <TabsTrigger value="recuperar" className="flex-1">
              Recuperar senha
            </TabsTrigger>
          </TabsList>

          <TabsContent value="entrar">
            <form action={actionLogin} className="grid gap-4 pt-2">
              <Mensagens erro={estadoLogin.erro} ok={estadoLogin.ok} />
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
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
              <Button type="submit" disabled={pendenteLogin}>
                {pendenteLogin && <Loader2 className="animate-spin" />}
                Entrar
              </Button>
              <p className="text-muted-foreground text-xs">
                O acesso é criado pelo sindicato — você recebe um convite por
                email para definir a senha.
              </p>
            </form>
          </TabsContent>

          <TabsContent value="recuperar">
            <form action={actionSenha} className="grid gap-4 pt-2">
              <Mensagens erro={estadoSenha.erro} ok={estadoSenha.ok} />
              <div className="grid gap-2">
                <Label htmlFor="email-recuperar">Email</Label>
                <Input
                  id="email-recuperar"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </div>
              <Button type="submit" disabled={pendenteSenha}>
                {pendenteSenha && <Loader2 className="animate-spin" />}
                Enviar link de redefinição
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
