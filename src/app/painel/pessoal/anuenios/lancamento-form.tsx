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
  atualizarLancamentoAnuenio,
  criarLancamentoAnuenio,
  excluirLancamentoAnuenio,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type AnuenioFormDados = {
  id: string
  funcionario_id: string | null
  funcionarioNome: string | null
  nivel_atual_id: string | null
  nivel_atual_data: string | null
  informado_contabilidade: boolean | null
}

export function AnuenioLancamentoForm({
  funcionarios,
  niveis,
  lancamento,
}: {
  funcionarios: { usuarioId: string; nome: string }[]
  /** Degraus da base com rótulo pronto ('Nível 4 — 4,6%'). */
  niveis: { id: string; rotulo: string }[]
  lancamento?: AnuenioFormDados
}) {
  const [estado, formAction, pendente] = useActionState(
    lancamento ? atualizarLancamentoAnuenio : criarLancamentoAnuenio,
    {}
  )
  const [estadoExcluir, excluirAction, excluindo] = useActionState(
    excluirLancamentoAnuenio,
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
        {lancamento && <input type="hidden" name="id" value={lancamento.id} />}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados do anuênio</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {lancamento ? (
              <div className="grid gap-1.5">
                <Label>Funcionário</Label>
                <Input
                  value={lancamento.funcionarioNome ?? "(sem nome)"}
                  disabled
                />
                <input
                  type="hidden"
                  name="funcionario_id"
                  value={lancamento.funcionario_id ?? ""}
                />
              </div>
            ) : (
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
              <Label htmlFor="nivel_atual_id">Nível do anuênio *</Label>
              <select
                id="nivel_atual_id"
                name="nivel_atual_id"
                required
                defaultValue={lancamento?.nivel_atual_id ?? ""}
                className={SELECT}
              >
                <option value="" disabled>
                  Escolha o nível
                </option>
                {niveis.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.rotulo}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="nivel_atual_data">Vale desde *</Label>
              <Input
                id="nivel_atual_data"
                name="nivel_atual_data"
                type="date"
                required
                defaultValue={lancamento?.nivel_atual_data ?? ""}
              />
              <p className="text-muted-foreground text-xs">
                O próximo nível é calculado automaticamente: um degrau acima,
                um ano depois desta data.
              </p>
            </div>

            <div className="grid content-end pb-1">
              <label className="text-muted-foreground flex items-center gap-2 text-sm">
                <Checkbox
                  name="informado_contabilidade"
                  defaultChecked={lancamento?.informado_contabilidade === true}
                />
                Informado à contabilidade
              </label>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" asChild>
            <Link href="/painel/pessoal/anuenios">Cancelar</Link>
          </Button>
          <Button type="submit" disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            {lancamento ? "Salvar alterações" : "Criar lançamento"}
          </Button>
        </div>
      </form>

      {lancamento && (
        <form
          action={excluirAction}
          onSubmit={(e) => {
            if (!confirm("Excluir este lançamento de anuênio?")) {
              e.preventDefault()
            }
          }}
          className="flex justify-end border-t pt-4"
        >
          <input type="hidden" name="id" value={lancamento.id} />
          <Button
            type="submit"
            variant="ghost"
            disabled={excluindo}
            className="text-destructive hover:text-destructive"
          >
            {excluindo ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Excluir lançamento
          </Button>
        </form>
      )}
    </div>
  )
}
