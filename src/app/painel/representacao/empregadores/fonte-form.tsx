"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  atualizarFontePagadora,
  criarFontePagadora,
  excluirFontePagadora,
} from "./actions"

export type FonteFormDados = {
  id: string
  nome_fantasia: string | null
  nome_razao: string | null
  cnpj_cpf: string | null
  fundo_pensao: boolean | null
  inativa: boolean | null
  filiadosAtivos: number
}

export function FonteForm({ fonte }: { fonte?: FonteFormDados }) {
  const [estado, formAction, pendente] = useActionState(
    fonte ? atualizarFontePagadora : criarFontePagadora,
    {}
  )
  const [estadoExcluir, excluirAction, excluindo] = useActionState(
    excluirFontePagadora,
    {}
  )

  const erro = estado.erro ?? estadoExcluir.erro

  return (
    <div className="grid gap-4">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <form action={formAction} className="grid gap-4">
        {fonte && <input type="hidden" name="id" value={fonte.id} />}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados da fonte</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="nome_fantasia">Nome *</Label>
              <Input
                id="nome_fantasia"
                name="nome_fantasia"
                defaultValue={fonte?.nome_fantasia ?? ""}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="nome_razao">Razão social</Label>
              <Input
                id="nome_razao"
                name="nome_razao"
                defaultValue={fonte?.nome_razao ?? ""}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cnpj_cpf">CNPJ / CPF</Label>
              <Input
                id="cnpj_cpf"
                name="cnpj_cpf"
                defaultValue={fonte?.cnpj_cpf ?? ""}
                placeholder="Somente números"
              />
            </div>
            <div className="grid content-end gap-2 pb-1">
              <label className="text-muted-foreground flex items-center gap-2 text-sm">
                <Checkbox
                  name="fundo_pensao"
                  defaultChecked={fonte?.fundo_pensao === true}
                />
                É fundo de pensão (senão, empregador)
              </label>
              {fonte && (
                <label className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Checkbox
                    name="inativa"
                    defaultChecked={fonte.inativa === true}
                  />
                  Fonte inativa
                </label>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" asChild>
            <Link href="/painel/representacao/empregadores">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            {fonte ? "Salvar alterações" : "Criar fonte pagadora"}
          </Button>
        </div>
      </form>

      {fonte && (
        <form
          action={excluirAction}
          onSubmit={(e) => {
            if (
              !confirm(
                "Excluir esta fonte da lista de fontes pagadoras? O cadastro da empresa é mantido; fontes com vínculos de filiação não podem ser excluídas."
              )
            ) {
              e.preventDefault()
            }
          }}
          className="flex justify-end border-t pt-4"
        >
          <input type="hidden" name="id" value={fonte.id} />
          <Button
            type="submit"
            variant="ghost"
            disabled={excluindo}
            className="text-destructive hover:text-destructive"
          >
            {excluindo ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Excluir fonte
          </Button>
        </form>
      )}
    </div>
  )
}
