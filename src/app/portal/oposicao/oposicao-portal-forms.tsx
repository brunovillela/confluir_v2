"use client"

import { useActionState, useState } from "react"
import { KeyRound, Loader2, Mail } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  confirmarCodigoFiliado,
  confirmarCodigoTrabalhador,
  enviarCodigoFiliado,
  enviarCodigoTrabalhador,
} from "./actions"

type Estado = { erro?: string; ok?: string }

export function AcessoNaoFiliado() {
  const [aba, setAba] = useState<"filiado" | "trabalhador">("trabalhador")

  return (
    <div className="grid gap-4">
      <div className="flex gap-2">
        <Button
          type="button"
          variant={aba === "trabalhador" ? "default" : "outline"}
          size="sm"
          onClick={() => setAba("trabalhador")}
        >
          Sou trabalhador
        </Button>
        <Button
          type="button"
          variant={aba === "filiado" ? "default" : "outline"}
          size="sm"
          onClick={() => setAba("filiado")}
        >
          Sou filiado
        </Button>
      </div>

      {aba === "trabalhador" ? <FormTrabalhador /> : <FormFiliado />}
    </div>
  )
}

function CampoToken() {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="token">Código recebido por e-mail</Label>
      <Input
        id="token"
        name="token"
        inputMode="numeric"
        maxLength={10}
        required
        placeholder="Código"
      />
    </div>
  )
}

function Mensagens({ estado }: { estado: Estado }) {
  return (
    <>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
    </>
  )
}

function FormTrabalhador() {
  const [nome, setNome] = useState("")
  const [cpf, setCpf] = useState("")
  const [email, setEmail] = useState("")
  const [enviado, setEnviado] = useState(false)
  const [estEnviar, actEnviar, pendEnviar] = useActionState(
    async (prev: Estado, fd: FormData) => {
      const r = await enviarCodigoTrabalhador(prev, fd)
      if (r.ok) setEnviado(true)
      return r
    },
    {}
  )
  const [estConfirmar, actConfirmar, pendConfirmar] = useActionState(
    confirmarCodigoTrabalhador,
    {}
  )

  return (
    <div className="grid gap-4">
      <form action={actEnviar} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="t-nome">Nome completo</Label>
          <Input
            id="t-nome"
            name="nome"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="t-cpf">CPF</Label>
            <Input
              id="t-cpf"
              name="cpf"
              inputMode="numeric"
              required
              value={cpf}
              onChange={(e) => setCpf(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="t-email">E-mail</Label>
            <Input
              id="t-email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
        <Mensagens estado={estEnviar} />
        <Button type="submit" disabled={pendEnviar}>
          {pendEnviar ? <Loader2 className="animate-spin" /> : <Mail />}
          {enviado ? "Reenviar código" : "Enviar código"}
        </Button>
      </form>

      {enviado && (
        <form action={actConfirmar} className="grid gap-3 border-t pt-4">
          <input type="hidden" name="nome" value={nome} />
          <input type="hidden" name="cpf" value={cpf} />
          <input type="hidden" name="email" value={email} />
          <CampoToken />
          <Mensagens estado={estConfirmar} />
          <Button type="submit" disabled={pendConfirmar}>
            {pendConfirmar ? <Loader2 className="animate-spin" /> : <KeyRound />}
            Entrar
          </Button>
        </form>
      )}
    </div>
  )
}

function FormFiliado() {
  const [cpf, setCpf] = useState("")
  const [enviado, setEnviado] = useState(false)
  const [estEnviar, actEnviar, pendEnviar] = useActionState(
    async (prev: Estado, fd: FormData) => {
      const r = await enviarCodigoFiliado(prev, fd)
      if (r.ok) setEnviado(true)
      return r
    },
    {}
  )
  const [estConfirmar, actConfirmar, pendConfirmar] = useActionState(
    confirmarCodigoFiliado,
    {}
  )

  return (
    <div className="grid gap-4">
      <form action={actEnviar} className="grid gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="f-cpf">CPF do filiado</Label>
          <Input
            id="f-cpf"
            name="cpf"
            inputMode="numeric"
            required
            value={cpf}
            onChange={(e) => setCpf(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            Enviaremos o código para o e-mail do seu cadastro.
          </p>
        </div>
        <Mensagens estado={estEnviar} />
        <Button type="submit" disabled={pendEnviar}>
          {pendEnviar ? <Loader2 className="animate-spin" /> : <Mail />}
          {enviado ? "Reenviar código" : "Enviar código"}
        </Button>
      </form>

      {enviado && (
        <form action={actConfirmar} className="grid gap-3 border-t pt-4">
          <input type="hidden" name="cpf" value={cpf} />
          <CampoToken />
          <Mensagens estado={estConfirmar} />
          <Button type="submit" disabled={pendConfirmar}>
            {pendConfirmar ? <Loader2 className="animate-spin" /> : <KeyRound />}
            Entrar
          </Button>
        </form>
      )}
    </div>
  )
}
