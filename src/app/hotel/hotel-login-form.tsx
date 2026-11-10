"use client"

import { useActionState, useRef } from "react"
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
import { CampoSenha } from "@/components/ui/campo-senha"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { renovarTurnstile, Turnstile } from "@/components/auth/turnstile"
import type { EstadoForm } from "@/lib/contas"

import { loginHotel, recuperarSenhaHotel } from "./actions"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

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
  // Token novo do Turnstile a cada resposta: o anterior já foi gasto.
  const form1 = useRef<HTMLFormElement>(null)
  const form2 = useRef<HTMLFormElement>(null)
  const [estadoLogin, actionLogin, pendenteLogin] = useActionState(
    async (prev: EstadoForm, fd: FormData) => {
      const r = await loginHotel(prev, fd)
      renovarTurnstile(form1.current)
      return r
    },
    {}
  )
  const envio1 = useEnvioFormulario(actionLogin, estadoLogin, { ref: form1 })
  const [estadoSenha, actionSenha, pendenteSenha] = useActionState(
    async (prev: EstadoForm, fd: FormData) => {
      const r = await recuperarSenhaHotel(prev, fd)
      renovarTurnstile(form2.current)
      return r
    },
    {}
  )
  const envio2 = useEnvioFormulario(actionSenha, estadoSenha, { ref: form2 })

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
            <form action={actionLogin} {...envio1} className="grid gap-4 pt-2">
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
                <CampoSenha
                  id="senha"
                  name="senha"
                  autoComplete="current-password"
                  required
                />
              </div>
              <Turnstile acao="login_hotel" />
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
            <form action={actionSenha} {...envio2} className="grid gap-4 pt-2">
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
              <Turnstile acao="senha_hotel" />
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
