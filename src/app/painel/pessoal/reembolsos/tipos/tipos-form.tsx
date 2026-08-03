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
} from "../actions"

export type TipoReembolsoFormDados = {
  id: string
  nome: string
  descricao: string | null
  /** Teto já em texto pt-BR (ex.: '500,00'). */
  limiteTexto: string
  ativa: boolean
}

export function TipoReembolsoForm({
  tipo,
}: {
  tipo?: TipoReembolsoFormDados
}) {
  const [estado, formAction, pendente] = useActionState(
    tipo ? atualizarTipoReembolso : criarTipoReembolso,
    {}
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {tipo ? `Editar tipo — ${tipo.nome}` : "Adicionar tipo de reembolso"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
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
              <Label htmlFor="valor_limite">Teto por solicitação (R$)</Label>
              <Input
                id="valor_limite"
                name="valor_limite"
                inputMode="decimal"
                placeholder="Em branco = sem teto"
                defaultValue={tipo?.limiteTexto ?? ""}
              />
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
                <Link href="/painel/pessoal/reembolsos/tipos">Cancelar</Link>
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

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Excluir este tipo de reembolso?")) e.preventDefault()
      }}
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
