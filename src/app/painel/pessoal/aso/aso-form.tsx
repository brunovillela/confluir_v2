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

import { atualizarAsoAction, criarAsoAction, excluirAsoAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type AsoFormDados = {
  id: string
  funcionario_id: string | null
  data: string | null
  tipo: string | null
  vencimento: string | null
  realizado: boolean | null
  enviado: boolean | null
  temArquivo: boolean
}

export function AsoForm({
  funcionarios,
  tipos,
  aso,
}: {
  funcionarios: { usuarioId: string; nome: string }[]
  tipos: readonly string[]
  aso?: AsoFormDados
}) {
  const [estado, formAction, pendente] = useActionState(
    aso ? atualizarAsoAction : criarAsoAction,
    {}
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {aso ? "Editar ASO" : "Registrar ASO"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="grid gap-4">
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          {aso && <input type="hidden" name="id" value={aso.id} />}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="funcionario_id">Funcionário *</Label>
              <select
                id="funcionario_id"
                name="funcionario_id"
                required
                defaultValue={aso?.funcionario_id ?? ""}
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

            <div className="grid gap-1.5">
              <Label htmlFor="tipo">Tipo *</Label>
              <select
                id="tipo"
                name="tipo"
                required
                defaultValue={aso?.tipo ?? ""}
                className={SELECT}
              >
                <option value="" disabled>
                  Escolha o tipo
                </option>
                {tipos.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="data">Data do exame *</Label>
                <Input
                  id="data"
                  name="data"
                  type="date"
                  required
                  defaultValue={aso?.data ?? ""}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="vencimento">Vencimento</Label>
                <Input
                  id="vencimento"
                  name="vencimento"
                  type="date"
                  defaultValue={aso?.vencimento ?? ""}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="arquivo">
                ASO (PDF/JPG/PNG{aso?.temArquivo ? " — substitui o atual" : ""})
              </Label>
              <Input
                id="arquivo"
                name="arquivo"
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
              />
            </div>

            <div className="flex flex-wrap content-end gap-4 pb-1 sm:col-span-2">
              <label className="text-muted-foreground flex items-center gap-2 text-sm">
                <Checkbox
                  name="realizado"
                  defaultChecked={aso ? aso.realizado === true : true}
                />
                Exame realizado
              </label>
              <label className="text-muted-foreground flex items-center gap-2 text-sm">
                <Checkbox name="enviado" defaultChecked={aso?.enviado === true} />
                Enviado ao funcionário/contabilidade
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            {aso && (
              <Button variant="ghost" asChild>
                <Link href="/painel/pessoal/aso">Cancelar</Link>
              </Button>
            )}
            <Button type="submit" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" />}
              {aso ? "Salvar ASO" : "Registrar ASO"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export function ExcluirAsoBotao({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(excluirAsoAction, {})

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Excluir este ASO?")) e.preventDefault()
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
