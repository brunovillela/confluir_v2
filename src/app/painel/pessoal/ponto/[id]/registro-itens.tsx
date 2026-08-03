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
  atualizarRegistroPonto,
  criarRegistroPonto,
  excluirRegistroPonto,
} from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type RegistroPontoFormDados = {
  id: string
  funcionario_id: string | null
  funcionarioNome: string | null
  liberado: boolean | null
  horas_realizadas_70: number | null
  horas_pagas_70: number | null
  saldo_remanescente_70: number | null
  saldo_remessa_anterior_70: number | null
  horas_realizadas_100: number | null
  horas_pagas_100: number | null
  saldo_remanescente_100: number | null
  saldo_remessa_anterior_100: number | null
}

const GRUPOS = [
  {
    titulo: "Horas 70%",
    campos: [
      ["horas_realizadas_70", "Realizadas"],
      ["horas_pagas_70", "Pagas"],
      ["saldo_remanescente_70", "Saldo remanescente"],
      ["saldo_remessa_anterior_70", "Saldo da remessa anterior"],
    ],
  },
  {
    titulo: "Horas 100%",
    campos: [
      ["horas_realizadas_100", "Realizadas"],
      ["horas_pagas_100", "Pagas"],
      ["saldo_remanescente_100", "Saldo remanescente"],
      ["saldo_remessa_anterior_100", "Saldo da remessa anterior"],
    ],
  },
] as const

function numeroBr(v: number | null): string {
  return v === null
    ? ""
    : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
}

/**
 * Formulário de registro de ponto: criação (com seleção de funcionário) ou
 * edição (funcionário fixo, vindo de ?editar=<id> na página da remessa).
 */
export function RegistroPontoForm({
  remessaId,
  funcionarios,
  registro,
}: {
  remessaId: string
  funcionarios: { usuarioId: string; nome: string }[]
  registro?: RegistroPontoFormDados
}) {
  const [estado, formAction, pendente] = useActionState(
    registro ? atualizarRegistroPonto : criarRegistroPonto,
    {}
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {registro
            ? `Editar registro — ${registro.funcionarioNome ?? "(sem nome)"}`
            : "Adicionar registro de ponto"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <input type="hidden" name="remessa_id" value={remessaId} />
          {registro && <input type="hidden" name="id" value={registro.id} />}

          <div className="grid gap-4 sm:grid-cols-2">
            {!registro && (
              <div className="grid gap-1.5">
                <Label htmlFor="funcionario_id">Funcionário *</Label>
                <select
                  id="funcionario_id"
                  name="funcionario_id"
                  required
                  defaultValue=""
                  className={SELECT}
                >
                  <option value="" disabled>
                    Escolha o funcionário
                  </option>
                  {funcionarios.map((f) => (
                    <option key={f.usuarioId} value={f.usuarioId}>
                      {f.nome}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="arquivo">
                Espelho de ponto (PDF{registro ? " — substitui o atual" : ", opcional"})
              </Label>
              <Input id="arquivo" name="arquivo" type="file" accept="application/pdf" />
            </div>
            <div className="grid content-end pb-1">
              <label className="text-muted-foreground flex items-center gap-2 text-sm">
                <Checkbox
                  name="liberado"
                  defaultChecked={registro ? registro.liberado === true : true}
                />
                Liberado para o funcionário
              </label>
            </div>
          </div>

          {GRUPOS.map((grupo) => (
            <div key={grupo.titulo} className="grid gap-2">
              <p className="text-sm font-medium">{grupo.titulo}</p>
              <div className="grid gap-3 sm:grid-cols-4">
                {grupo.campos.map(([campo, rotulo]) => (
                  <div key={campo} className="grid gap-1.5">
                    <Label htmlFor={campo}>{rotulo}</Label>
                    <Input
                      id={campo}
                      name={campo}
                      inputMode="decimal"
                      placeholder="0,00"
                      defaultValue={numeroBr(registro?.[campo] ?? null)}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-end gap-2">
            {registro && (
              <Button variant="ghost" asChild>
                <Link href={`/painel/pessoal/ponto/${remessaId}`}>Cancelar</Link>
              </Button>
            )}
            <Button type="submit" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" />}
              {registro ? "Salvar registro" : "Adicionar registro"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function ExcluirRegistroBotao({
  id,
  remessaId,
}: {
  id: string
  remessaId: string
}) {
  const [estado, formAction, pendente] = useActionState(excluirRegistroPonto, {})

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Excluir este registro de ponto?")) e.preventDefault()
      }}
      className="inline-flex"
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="remessa_id" value={remessaId} />
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
