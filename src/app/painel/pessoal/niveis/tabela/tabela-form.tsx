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
  atualizarNivelBase,
  criarNivelBase,
  excluirNivelBase,
} from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type NivelBaseFormDados = {
  id: string
  cargo_id: string | null
  ordem: number | null
  nivel_vertical: string | null
  nivel_horizontal: string | null
  nivel_carreira: string | null
  /** Salário já formatado para edição (ex.: '3.000,12'). */
  salarioTexto: string
}

const CARREIRAS = ["Júnior", "Pleno", "Sênior"]

export function NivelBaseForm({
  cargos,
  degrau,
}: {
  cargos: { id: string; nome: string }[]
  degrau?: NivelBaseFormDados
}) {
  const [estado, formAction, pendente] = useActionState(
    degrau ? atualizarNivelBase : criarNivelBase,
    {}
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {degrau
            ? `Editar degrau — ${[degrau.nivel_vertical, degrau.nivel_horizontal].filter(Boolean).join("-")}`
            : "Adicionar degrau"}
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
              <Label htmlFor="cargo_id">Cargo *</Label>
              <select
                id="cargo_id"
                name="cargo_id"
                required
                defaultValue={degrau?.cargo_id ?? ""}
                className={SELECT}
              >
                <option value="" disabled>
                  Escolha o cargo
                </option>
                {cargos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nivel_carreira">Carreira</Label>
              <select
                id="nivel_carreira"
                name="nivel_carreira"
                defaultValue={degrau?.nivel_carreira ?? ""}
                className={SELECT}
              >
                <option value="">—</option>
                {CARREIRAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nivel_vertical">Nível vertical *</Label>
              <Input
                id="nivel_vertical"
                name="nivel_vertical"
                placeholder="Ex.: 428"
                defaultValue={degrau?.nivel_vertical ?? ""}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nivel_horizontal">Nível horizontal</Label>
              <Input
                id="nivel_horizontal"
                name="nivel_horizontal"
                placeholder="Ex.: A"
                defaultValue={degrau?.nivel_horizontal ?? ""}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="salario_base">Salário básico (R$) *</Label>
              <Input
                id="salario_base"
                name="salario_base"
                inputMode="decimal"
                placeholder="Ex.: 3.000,12"
                defaultValue={degrau?.salarioTexto ?? ""}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ordem">Ordem</Label>
              <Input
                id="ordem"
                name="ordem"
                inputMode="numeric"
                placeholder="Ex.: 4281 (ordena a tabela)"
                defaultValue={degrau?.ordem ?? ""}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            {degrau && (
              <Button variant="ghost" asChild>
                <Link href="/painel/pessoal/niveis/tabela">Cancelar</Link>
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

export function ExcluirNivelBaseBotao({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(excluirNivelBase, {})

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Excluir este degrau da tabela salarial?")) {
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
