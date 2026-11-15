"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  atualizarTipoReembolso,
  criarTipoReembolso,
  excluirTipoReembolso,
  salvarPrazoReembolsoAction,
} from "../actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

export type TipoReembolsoFormDados = {
  id: string
  nome: string
  descricao: string | null
  /** Teto já em texto pt-BR (ex.: '500,00'). */
  limiteTexto: string
  /** Porcentagem em texto pt-BR (ex.: '70'). */
  porcentagemTexto: string
  ativa: boolean
}

export function TipoReembolsoForm({
  tipo,
  voltarHref,
}: {
  tipo?: TipoReembolsoFormDados
  /** Cancelar volta à lista na linha do tipo. */
  voltarHref?: string
}) {
  const [estado, formAction, pendente] = useActionState(
    tipo ? atualizarTipoReembolso : criarTipoReembolso,
    {}
  )
  const envio = useEnvioFormulario(formAction, estado)

  return (
    <Card id="formulario-tipo" className="scroll-mt-20">
      <CardHeader>
        <CardTitle className="text-base">
          {tipo ? `Editar tipo — ${tipo.nome}` : "Adicionar tipo de reembolso"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} {...envio} className="grid gap-4">
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          {tipo && <input type="hidden" name="id" value={tipo.id} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="nome">Nome (como está no ACT) *</Label>
              <Input
                id="nome"
                name="nome"
                placeholder="Ex.: Auxílio creche"
                defaultValue={tipo?.nome ?? ""}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="valor_limite">Teto do reembolso por solicitação (R$)</Label>
              <Input
                id="valor_limite"
                name="valor_limite"
                inputMode="decimal"
                placeholder="Em branco = sem teto"
                defaultValue={tipo?.limiteTexto ?? ""}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="porcentagem">Porcentagem paga (%)</Label>
              <Input
                id="porcentagem"
                name="porcentagem"
                inputMode="decimal"
                placeholder="Em branco = 100%"
                defaultValue={tipo?.porcentagemTexto ?? ""}
              />
              <p className="text-muted-foreground text-xs">
                O reembolso é esta porcentagem da despesa, limitada ao teto.
              </p>
            </div>
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="descricao">Descrição / regra do ACT</Label>
              <textarea
                id="descricao"
                name="descricao"
                rows={2}
                placeholder="Ex.: cláusula 12ª — filhos de até 6 anos, mediante nota fiscal"
                defaultValue={tipo?.descricao ?? ""}
                className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"
              />
            </div>
            <div className="grid content-end pb-1">
              <label className="text-muted-foreground flex items-center gap-2 text-sm">
                <Checkbox name="ativa" defaultChecked={tipo ? tipo.ativa : true} />
                Disponível para solicitação
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            {tipo && (
              <Button variant="ghost" asChild>
                <Link href={voltarHref ?? "/painel/pessoal/reembolsos/tipos"}>Cancelar</Link>
              </Button>
            )}
            <Button type="submit" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" />}
              {tipo ? "Salvar tipo" : "Adicionar tipo"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function ExcluirTipoReembolsoBotao({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(
    excluirTipoReembolso,
    {}
  )
  const envio2 = useEnvioFormulario(formAction, estado, {
    antes: (e) => {
      confirmarEnvio(e, "Excluir este tipo de reembolso?")},
  })

  return (
    <form
      action={formAction} {...envio2}
      className="inline-flex items-center"
    >
      <input type="hidden" name="id" value={id} />
      {estado.erro && (
        <span className="text-destructive mr-1 text-xs">{estado.erro}</span>
      )}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        className="text-destructive hover:text-destructive h-7 px-2"
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
    </form>
  )
}

/** Prazo do pedido: dias depois da data da despesa (vazio = sem limite). */
export function PrazoReembolsoForm({ prazoDias }: { prazoDias: number | null }) {
  const [estado, formAction, pendente] = useActionState(salvarPrazoReembolsoAction, {})
  const envio = useEnvioFormulario(formAction, estado)
  return (
    <form action={formAction} {...envio} className="grid gap-3">
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
      <div className="flex flex-wrap items-end gap-2">
        <div className="grid gap-1.5">
          <Label htmlFor="prazo_dias">Aceitar despesas de até (dias)</Label>
          <Input
            id="prazo_dias"
            name="prazo_dias"
            type="number"
            min={1}
            max={3650}
            step={1}
            inputMode="numeric"
            placeholder="Sem limite"
            defaultValue={prazoDias ?? ""}
            className="w-40"
          />
        </div>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Salvar prazo
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Contados a partir da data da despesa: com 90, uma despesa de 01/03 pode ser pedida até 30/05. Em
        branco, não há limite. Vale para os pedidos feitos no Meu perfil e pelo Telegram.
      </p>
    </form>
  )
}
