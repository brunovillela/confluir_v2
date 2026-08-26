"use client"

import { useActionState } from "react"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { ConvidadoLinha } from "@/lib/db/custeio"

import { salvarConvidadoAction } from "../actions"

export function ConvidadoForm({
  convidado,
  aoCancelarHref,
}: {
  convidado?: ConvidadoLinha
  aoCancelarHref: string
}) {
  const [estado, formAction, pendente] = useActionState(
    salvarConvidadoAction,
    {}
  )

  return (
    <form action={formAction} className="grid gap-5">
      {convidado && (
        <input type="hidden" name="convidado_id" value={convidado.id} />
      )}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" name="nome" defaultValue={convidado?.nome ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cpf">CPF</Label>
          <Input id="cpf" name="cpf" defaultValue={convidado?.cpf ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            id="email"
            name="email"
            type="email"
            defaultValue={convidado?.email ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="telefone">Telefone</Label>
          <Input
            id="telefone"
            name="telefone"
            defaultValue={convidado?.telefone ?? ""}
          />
        </div>
      </div>

      <fieldset className="border-border grid gap-4 rounded-md border p-4">
        <legend className="text-muted-foreground px-1 text-xs">
          Dados bancários (para o pagamento)
        </legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="grid gap-1.5">
            <Label htmlFor="banco">Banco</Label>
            <Input id="banco" name="banco" defaultValue={convidado?.banco ?? ""} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="agencia">Agência</Label>
            <Input
              id="agencia"
              name="agencia"
              defaultValue={convidado?.agencia ?? ""}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="conta">Conta</Label>
            <Input id="conta" name="conta" defaultValue={convidado?.conta ?? ""} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tipo_conta">Tipo de conta</Label>
            <Input
              id="tipo_conta"
              name="tipo_conta"
              defaultValue={convidado?.tipo_conta ?? ""}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="pix">Chave PIX</Label>
            <Input id="pix" name="pix" defaultValue={convidado?.pix ?? ""} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tipo_chave_pix">Tipo da chave PIX</Label>
            <Input
              id="tipo_chave_pix"
              name="tipo_chave_pix"
              defaultValue={convidado?.tipo_chave_pix ?? ""}
            />
          </div>
        </div>
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="observacoes">Observações</Label>
        <Textarea
          id="observacoes"
          name="observacoes"
          rows={2}
          defaultValue={convidado?.observacoes ?? ""}
        />
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          {convidado ? "Salvar convidado" : "Cadastrar convidado"}
        </Button>
        <Button type="button" variant="ghost" asChild>
          <a href={aoCancelarHref}>Cancelar</a>
        </Button>
      </div>
    </form>
  )
}
