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
  atualizarLancamentoNivel,
  criarLancamentoNivel,
  excluirLancamentoNivel,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type OpcaoNivelBase = {
  id: string
  rotulo: string
  cargoNome: string
}

export type NivelFormDados = {
  id: string
  funcionario_id: string | null
  funcionarioNome: string | null
  tipo_avanco: string | null
  nivel_atual_id: string | null
  nivel_atual_data: string | null
  proximo_nivel_id: string | null
  proximo_nivel_data: string | null
}

function SelectNivel({
  id,
  name,
  opcoes,
  defaultValue,
  required,
  placeholder,
}: {
  id: string
  name: string
  opcoes: OpcaoNivelBase[]
  defaultValue: string
  required?: boolean
  placeholder: string
}) {
  const cargos = [...new Set(opcoes.map((o) => o.cargoNome))]
  return (
    <select
      id={id}
      name={name}
      required={required}
      defaultValue={defaultValue}
      className={SELECT}
    >
      <option value="" disabled={required}>
        {placeholder}
      </option>
      {cargos.map((cargo) => (
        <optgroup key={cargo} label={cargo}>
          {opcoes
            .filter((o) => o.cargoNome === cargo)
            .map((o) => (
              <option key={o.id} value={o.id}>
                {o.rotulo}
              </option>
            ))}
        </optgroup>
      ))}
    </select>
  )
}

export function NivelLancamentoForm({
  funcionarios,
  niveis,
  tiposAvanco,
  lancamento,
}: {
  funcionarios: { usuarioId: string; nome: string }[]
  niveis: OpcaoNivelBase[]
  tiposAvanco: readonly string[]
  lancamento?: NivelFormDados
}) {
  const [estado, formAction, pendente] = useActionState(
    lancamento ? atualizarLancamentoNivel : criarLancamentoNivel,
    {}
  )
  const [estadoExcluir, excluirAction, excluindo] = useActionState(
    excluirLancamentoNivel,
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
            <CardTitle className="text-base">Dados do nível salarial</CardTitle>
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
              <Label htmlFor="tipo_avanco">Tipo de avanço *</Label>
              <select
                id="tipo_avanco"
                name="tipo_avanco"
                required
                defaultValue={lancamento?.tipo_avanco ?? ""}
                className={SELECT}
              >
                <option value="" disabled>
                  Escolha o tipo
                </option>
                {tiposAvanco.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="nivel_atual_id">Nível salarial *</Label>
              <SelectNivel
                id="nivel_atual_id"
                name="nivel_atual_id"
                opcoes={niveis}
                defaultValue={lancamento?.nivel_atual_id ?? ""}
                required
                placeholder="Escolha o nível"
              />
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
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="proximo_nivel_id">Próximo nível (opcional)</Label>
              <SelectNivel
                id="proximo_nivel_id"
                name="proximo_nivel_id"
                opcoes={niveis}
                defaultValue={lancamento?.proximo_nivel_id ?? ""}
                placeholder="Sem previsão"
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="proximo_nivel_data">
                Previsão do próximo nível (opcional)
              </Label>
              <Input
                id="proximo_nivel_data"
                name="proximo_nivel_data"
                type="date"
                defaultValue={lancamento?.proximo_nivel_data ?? ""}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" asChild>
            <Link href="/painel/pessoal/niveis">Cancelar</Link>
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
            if (!confirm("Excluir este lançamento de nível salarial?")) {
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
