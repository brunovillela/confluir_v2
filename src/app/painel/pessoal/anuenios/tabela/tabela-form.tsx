"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  atualizarNivelAnuenioBase,
  criarNivelAnuenioBase,
  excluirNivelAnuenioBase,
} from "../actions"

export type DegrauFormDados = {
  id: string
  nivel: number | null
  /** Alíquota já em % (ex.: 4,6). */
  aliquotaPct: string
}

export function AnuenioBaseForm({ degrau }: { degrau?: DegrauFormDados }) {
  const [estado, formAction, pendente] = useActionState(
    degrau ? atualizarNivelAnuenioBase : criarNivelAnuenioBase,
    {}
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {degrau ? `Editar degrau — nível ${degrau.nivel ?? "?"}` : "Adicionar degrau"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          {degrau && <input type="hidden" name="id" value={degrau.id} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="nivel">Nível (anos de casa) *</Label>
              <Input
                id="nivel"
                name="nivel"
                inputMode="numeric"
                placeholder="Ex.: 5"
                defaultValue={degrau?.nivel ?? ""}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="aliquota">Alíquota (%) *</Label>
              <Input
                id="aliquota"
                name="aliquota"
                inputMode="decimal"
                placeholder="Ex.: 6,2"
                defaultValue={degrau?.aliquotaPct ?? ""}
                required
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            {degrau && (
              <Button variant="ghost" asChild>
                <Link href="/painel/pessoal/anuenios/tabela">Cancelar</Link>
              </Button>
            )}
            <Button type="submit" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" />}
              {degrau ? "Salvar degrau" : "Adicionar degrau"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function ExcluirDegrauBotao({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(
    excluirNivelAnuenioBase,
    {}
  )

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Excluir este degrau da tabela de anuênios?")) {
          e.preventDefault()
        }
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
