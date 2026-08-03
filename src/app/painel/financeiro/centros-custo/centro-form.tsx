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
import type { CentroCusto } from "@/lib/db/financeiro"

import {
  atualizarCentroCusto,
  criarCentroCusto,
  excluirCentroCusto,
} from "./actions"

export function CentroCustoForm({
  centro,
  tipos,
}: {
  centro?: CentroCusto
  /** Tipos já usados (datalist). */
  tipos: string[]
}) {
  const [estado, formAction, pendente] = useActionState(
    centro ? atualizarCentroCusto : criarCentroCusto,
    {}
  )
  const [estadoExcluir, excluirAction, excluindo] = useActionState(
    excluirCentroCusto,
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
        {centro && <input type="hidden" name="centro_id" value={centro.id} />}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados da conta</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label htmlFor="nome_da_conta">Nome da conta *</Label>
              <Input
                id="nome_da_conta"
                name="nome_da_conta"
                required
                defaultValue={centro?.nome_da_conta ?? ""}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="acesso">Código de acesso</Label>
              <Input
                id="acesso"
                name="acesso"
                defaultValue={centro?.acesso ?? ""}
                placeholder="13203"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="classificador">Classificador</Label>
              <Input
                id="classificador"
                name="classificador"
                defaultValue={centro?.classificador ?? ""}
                placeholder="1.3.02.03.00.00"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tipo_da_conta">Tipo da conta</Label>
              <Input
                id="tipo_da_conta"
                name="tipo_da_conta"
                list="tipos-centro-custo"
                defaultValue={centro?.tipo_da_conta ?? ""}
                placeholder="Despesa, Receita, Ativo…"
              />
              <datalist id="tipos-centro-custo">
                {tipos.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
            <label className="text-muted-foreground flex items-center gap-2 self-end pb-2 text-sm">
              <Checkbox
                name="usavel"
                defaultChecked={centro ? centro.usavel === true : true}
              />
              Conta usável (aparece nas opções de lançamento)
            </label>
            <div className="grid gap-1.5">
              <Label htmlFor="indicacoes">Indicações</Label>
              <textarea
                id="indicacoes"
                name="indicacoes"
                rows={2}
                defaultValue={centro?.indicacoes ?? ""}
                className="border-input placeholder:text-muted-foreground w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none"
                placeholder="Quando usar esta conta…"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="contraindicacoes">Contraindicações</Label>
              <textarea
                id="contraindicacoes"
                name="contraindicacoes"
                rows={2}
                defaultValue={centro?.contraindicacoes ?? ""}
                className="border-input placeholder:text-muted-foreground w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none"
                placeholder="Quando NÃO usar…"
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" asChild>
            <Link
              href={
                centro
                  ? `/painel/financeiro/centros-custo/${centro.id}`
                  : "/painel/financeiro/centros-custo"
              }
            >
              Cancelar
            </Link>
          </Button>
          <Button type="submit" disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            {centro ? "Salvar alterações" : "Criar centro de custo"}
          </Button>
        </div>
      </form>

      {centro && (
        <form
          action={excluirAction}
          onSubmit={(e) => {
            if (
              !confirm(
                "Excluir este centro de custo? Contas usadas em ordens ou contratos não podem ser excluídas."
              )
            ) {
              e.preventDefault()
            }
          }}
          className="flex justify-end border-t pt-4"
        >
          <input type="hidden" name="centro_id" value={centro.id} />
          <Button
            type="submit"
            variant="ghost"
            disabled={excluindo}
            className="text-destructive hover:text-destructive"
          >
            {excluindo ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Excluir centro de custo
          </Button>
        </form>
      )}
    </div>
  )
}
