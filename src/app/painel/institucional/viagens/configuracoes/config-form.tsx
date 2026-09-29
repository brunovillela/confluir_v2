"use client"

import { startTransition, useActionState } from "react"
import { Loader2, Save } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { salvarConfigViagensAction } from "./actions"

/** Aviso de pedidos novos, antecedência recomendada e orientações do pedido. */
export function ConfigViagensForm({
  emailsAviso,
  antecedenciaDias,
  orientacoes,
}: {
  emailsAviso: string[]
  antecedenciaDias: number | null
  orientacoes: string | null
}) {
  const [estado, formAction, pendente] = useActionState(salvarConfigViagensAction, {})

  return (
    <form
      // Pelo onSubmit, e não por `action`: o React 19 limpa o formulário
      // depois de uma action, e um e-mail inválido apagaria tudo o que foi digitado.
      onSubmit={(e) => {
        e.preventDefault()
        const dados = new FormData(e.currentTarget)
        startTransition(() => formAction(dados))
      }}
      className="grid gap-5"
    >
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert variant="success">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="emails_aviso">Avisar pedidos novos para</Label>
        <Input
          id="emails_aviso"
          name="emails_aviso"
          defaultValue={emailsAviso.join(", ")}
          placeholder="viagens@sindicato.org.br, secretaria@sindicato.org.br"
        />
        <p className="text-muted-foreground text-xs">
          Separe por vírgula. Cada pedido feito por um diretor ou funcionário manda um e-mail com
          os itens e o link para atender. Em branco, ninguém é avisado — os pedidos ficam só na
          lista.
        </p>
      </div>

      <div className="grid gap-1.5 sm:max-w-xs">
        <Label htmlFor="antecedencia_dias">Antecedência recomendada (dias)</Label>
        <Input
          id="antecedencia_dias"
          name="antecedencia_dias"
          type="number"
          min={0}
          max={365}
          defaultValue={antecedenciaDias ?? ""}
          placeholder="Ex.: 15"
        />
        <p className="text-muted-foreground text-xs">
          Pedido com menos antecedência que isso recebe um alerta no formulário e fica marcado
          &ldquo;em cima da hora&rdquo; na lista. Não bloqueia. Em branco, sem alerta.
        </p>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="orientacoes">Orientações no formulário de pedido</Label>
        <Textarea
          id="orientacoes"
          name="orientacoes"
          rows={4}
          defaultValue={orientacoes ?? ""}
          placeholder={
            "Ex.: Voos em classe econômica. Bagagem extra só com justificativa.\nHospedagem até R$ 350 a diária, perto do local da atividade."
          }
        />
        <p className="text-muted-foreground text-xs">
          A política de viagens da entidade. Aparece no topo do formulário, para quem pede e
          para a equipe que lança.
        </p>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar configurações
        </Button>
      </div>
    </form>
  )
}
