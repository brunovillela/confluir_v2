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
  atualizarTreinamento,
  criarTreinamento,
  excluirTreinamento,
} from "./actions"

export type TreinamentoFormDados = {
  id: string
  treinamento: string | null
  carga_horaria: number | null
  vencimento_meses: number | null
  alunos: number
}

export function TreinamentoForm({
  treinamento,
}: {
  treinamento?: TreinamentoFormDados
}) {
  const [estado, formAction, pendente] = useActionState(
    treinamento ? atualizarTreinamento : criarTreinamento,
    {}
  )
  const [estadoExcluir, excluirAction, excluindo] = useActionState(
    excluirTreinamento,
    {}
  )

  const erro = estado.erro ?? estadoExcluir.erro

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {treinamento ? "Editar treinamento" : "Adicionar treinamento"}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <form action={formAction} className="grid gap-4">
          {erro && (
            <Alert variant="destructive">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}
          {treinamento && (
            <input type="hidden" name="id" value={treinamento.id} />
          )}

          <div className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="treinamento">Nome do treinamento *</Label>
              <Input
                id="treinamento"
                name="treinamento"
                placeholder="Ex.: NR-05 CIPAA"
                defaultValue={treinamento?.treinamento ?? ""}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="carga_horaria">Carga horária (h)</Label>
                <Input
                  id="carga_horaria"
                  name="carga_horaria"
                  inputMode="decimal"
                  placeholder="Ex.: 8"
                  defaultValue={treinamento?.carga_horaria ?? ""}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="vencimento_meses">Validade (meses)</Label>
                <Input
                  id="vencimento_meses"
                  name="vencimento_meses"
                  inputMode="numeric"
                  placeholder="Em branco = não expira"
                  defaultValue={treinamento?.vencimento_meses ?? ""}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            {treinamento && (
              <Button variant="ghost" asChild>
                <Link href="/painel/pessoal/treinamentos">Cancelar</Link>
              </Button>
            )}
            <Button type="submit" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" />}
              {treinamento ? "Salvar treinamento" : "Adicionar treinamento"}
            </Button>
          </div>
        </form>

        {treinamento && (
          <form
            action={excluirAction}
            onSubmit={(e) => {
              if (
                !confirm(
                  "Excluir este treinamento? Só é possível excluir treinamentos sem alunos."
                )
              ) {
                e.preventDefault()
              }
            }}
            className="flex justify-end border-t pt-4"
          >
            <input type="hidden" name="id" value={treinamento.id} />
            <Button
              type="submit"
              variant="ghost"
              disabled={excluindo || treinamento.alunos > 0}
              className="text-destructive hover:text-destructive"
            >
              {excluindo ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Excluir treinamento
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
