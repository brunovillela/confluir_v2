"use client"

import { useActionState } from "react"
import { Check, CircleAlert, HandCoins, Loader2, ShoppingCart } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  confirmarAporte,
  prestarContas,
  registrarCompra,
  relatarPerda,
} from "./actions"

export function ConfirmarAporte({
  movimentacaoId,
  valor,
}: {
  movimentacaoId: string
  valor: string
}) {
  const [estado, formAction, pendente] = useActionState(confirmarAporte, {})
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          !confirm(
            `Confirmar que você recebeu ${valor} em espécie? A verba fica liberada e a conta abre.`
          )
        ) {
          e.preventDefault()
        }
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="movimentacao_id" value={movimentacaoId} />
      {estado.erro && (
        <span className="text-destructive text-xs">{estado.erro}</span>
      )}
      <Button type="submit" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Check />}
        Confirmar recebimento de {valor}
      </Button>
    </form>
  )
}

export function RegistrarCompra() {
  const [estado, formAction, pendente] = useActionState(registrarCompra, {})
  return (
    <form action={formAction} className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="valor-compra">Valor *</Label>
          <Input
            id="valor-compra"
            name="valor"
            inputMode="decimal"
            placeholder="0,00"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="descricao-compra">O que foi comprado *</Label>
          <Input
            id="descricao-compra"
            name="descricao"
            placeholder="Material de limpeza, café…"
            required
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <ShoppingCart />}
          Registrar compra
        </Button>
      </div>
    </form>
  )
}

export function PrestarContas() {
  const [estado, formAction, pendente] = useActionState(prestarContas, {})
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          !confirm(
            "Prestar contas agora? A conta fica travada para novas compras até a decisão do Financeiro."
          )
        ) {
          e.preventDefault()
        }
      }}
      className="grid gap-3"
    >
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="saldo_declarado">Dinheiro em mãos</Label>
          <Input
            id="saldo_declarado"
            name="saldo_declarado"
            inputMode="decimal"
            placeholder="0,00"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="observacao-prestacao">Observações</Label>
          <Input
            id="observacao-prestacao"
            name="observacao"
            placeholder="Notas fiscais entregues ao financeiro…"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <HandCoins />}
          Prestar contas
        </Button>
      </div>
    </form>
  )
}

export function RelatarPerda() {
  const [estado, formAction, pendente] = useActionState(relatarPerda, {})
  return (
    <form action={formAction} className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="descricao-perda">O que aconteceu *</Label>
        <textarea
          id="descricao-perda"
          name="descricao"
          required
          rows={3}
          className="border-input placeholder:text-muted-foreground w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none"
          placeholder="Descreva a perda, extravio ou diferença encontrada…"
        />
      </div>
      <div className="grid gap-1.5 sm:max-w-48">
        <Label htmlFor="valor-perda">Valor envolvido</Label>
        <Input
          id="valor-perda"
          name="valor"
          inputMode="decimal"
          placeholder="0,00"
        />
      </div>
      <p className="text-muted-foreground text-xs">
        O relato abre uma ocorrência para investigação do Financeiro — o
        saldo só é ajustado depois da apuração.
      </p>
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <CircleAlert />}
          Relatar problema
        </Button>
      </div>
    </form>
  )
}
