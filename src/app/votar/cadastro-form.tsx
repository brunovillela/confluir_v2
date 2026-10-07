"use client"

import { useActionState } from "react"
import { Loader2, ShieldCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { cadastrarNoLinkUnico, type EstadoCadastroLinkUnico } from "./actions"

/**
 * Passo 2 do link único: os dados que ligam o e-mail confirmado ao registro
 * da pessoa na lista de aptos (nome completo, e-mail da empresa, CPF e
 * nascimento).
 */
export function CadastroForm() {
  const [estado, acao, pendente] = useActionState<EstadoCadastroLinkUnico, FormData>(
    cadastrarNoLinkUnico,
    {}
  )
  const v = estado.valores
  return (
    // `key`: depois de um erro o formulário remonta com o que foi digitado.
    <form key={estado.tentativa ?? 0} action={acao} className="grid gap-4">
      <p className="text-muted-foreground text-sm">
        Agora, encontre o seu nome na lista de aptos. Pedimos estes dados uma vez só — é por eles que garantimos
        que cada pessoa vota uma única vez.
      </p>
      <div className="grid gap-1.5">
        <Label htmlFor="nome">Nome completo</Label>
        <Input id="nome" name="nome" autoComplete="name" defaultValue={v?.nome ?? ""} required />
        <p className="text-muted-foreground text-xs">Escreva o nome inteiro, como no crachá ou no contracheque.</p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="email_empresa">E-mail da empresa</Label>
        <Input
          id="email_empresa"
          name="email_empresa"
          type="email"
          defaultValue={v?.email_empresa ?? ""}
          placeholder="nome.sobrenome@empresa.com"
          required
        />
        <p className="text-muted-foreground text-xs">
          O seu e-mail corporativo — é por ele que a empresa enviou a lista de aptos ao sindicato.
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="cpf">CPF</Label>
        <Input
          id="cpf"
          name="cpf"
          inputMode="numeric"
          placeholder="000.000.000-00"
          defaultValue={v?.cpf ?? ""}
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="nascimento">Data de nascimento</Label>
        <Input id="nascimento" name="nascimento" type="date" defaultValue={v?.nascimento ?? ""} required />
      </div>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
        Confirmar meus dados
      </Button>
      <p className="text-muted-foreground text-xs">
        Avisamos o seu e-mail da empresa de que este cadastro foi feito. Seus dados servem só para conferir a sua
        identidade; o voto continua secreto.
      </p>
    </form>
  )
}
