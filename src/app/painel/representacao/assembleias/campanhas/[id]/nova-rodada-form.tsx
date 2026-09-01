"use client"

import { useActionState, useState } from "react"
import { Loader2, Plus } from "lucide-react"

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

import { ClausulaColetivaCampos } from "../../clausula-coletiva-campos"
import { novaRodada } from "../actions"

const TEXTAREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

export function NovaRodadaForm({ campanhaId }: { campanhaId: string }) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useActionState(novaRodada, {})

  if (!aberto) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova rodada
      </Button>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nova rodada</CardTitle>
        <CardDescription>
          Período em que as assembleias desta campanha acontecem. As perguntas
          e a lista de aptos são cadastradas na rodada.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <input type="hidden" name="campanha_id" value={campanhaId} />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="nome">Nome da rodada *</Label>
              <Input
                id="nome"
                name="nome"
                required
                placeholder="Ex.: 1ª rodada de assembleias"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="inicio">Início do período</Label>
              <Input id="inicio" name="inicio" type="date" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="termino">Término do período</Label>
              <Input id="termino" name="termino" type="date" />
            </div>
            <div className="grid gap-1.5 md:col-span-2">
              <Label htmlFor="descricao">Descrição</Label>
              <textarea
                id="descricao"
                name="descricao"
                rows={2}
                className={TEXTAREA}
                placeholder="Observações sobre a rodada (opcional)"
              />
            </div>
          </div>
          <ClausulaColetivaCampos />
          <div className="flex gap-2">
            <Button type="submit" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
              Criar rodada
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAberto(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
