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
  CATEGORIAS_DIARIA,
  CATEGORIA_DIARIA_PADRAO,
} from "@/lib/diarias-constantes"

import {
  atualizarTipoDiaria,
  criarTipoDiaria,
  excluirTipoDiaria,
} from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type TipoDiariaFormDados = {
  id: string
  nome: string
  categoria: string
  /** Valor já em texto pt-BR para edição (ex.: '350,00'). */
  valorTexto: string
  ativa: boolean
}

export function TipoDiariaForm({ tipo }: { tipo?: TipoDiariaFormDados }) {
  const [estado, formAction, pendente] = useActionState(
    tipo ? atualizarTipoDiaria : criarTipoDiaria,
    {}
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {tipo ? `Editar tipo — ${tipo.nome}` : "Adicionar tipo de diária"}
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
              <Label htmlFor="nome">Nome *</Label>
              <Input
                id="nome"
                name="nome"
                placeholder="Ex.: Viagem nacional com pernoite"
                defaultValue={tipo?.nome ?? ""}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="valor_reembolso">Valor da diária (R$) *</Label>
              <Input
                id="valor_reembolso"
                name="valor_reembolso"
                inputMode="decimal"
                placeholder="Ex.: 350,00"
                defaultValue={tipo?.valorTexto ?? ""}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="categoria">Categoria</Label>
              <select
                id="categoria"
                name="categoria"
                className={SELECT}
                defaultValue={tipo?.categoria ?? CATEGORIA_DIARIA_PADRAO}
              >
                {CATEGORIAS_DIARIA.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
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
                <Link href="/painel/pessoal/diarias/tipos">Cancelar</Link>
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

export function ExcluirTipoDiariaBotao({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(excluirTipoDiaria, {})

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Excluir este tipo de diária?")) e.preventDefault()
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
