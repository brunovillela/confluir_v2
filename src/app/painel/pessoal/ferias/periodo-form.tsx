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
  atualizarPeriodoAction,
  criarPeriodoAction,
  excluirPeriodoAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type PeriodoFormDados = {
  id: string
  trabalhador_id: string | null
  funcionarioNome: string | null
  aquisitivo_inicio: string | null
  aquisitivo_termino: string | null
  concessivo_inicio: string | null
  concessivo_termino: string | null
  dias_disponiveis: number | null
  abono_pecuniario: boolean | null
  finalizado: boolean | null
  gozos: number
}

export function PeriodoFeriasForm({
  funcionarios,
  periodo,
}: {
  funcionarios: { usuarioId: string; nome: string }[]
  periodo?: PeriodoFormDados
}) {
  const [estado, formAction, pendente] = useActionState(
    periodo ? atualizarPeriodoAction : criarPeriodoAction,
    {}
  )
  const [estadoExcluir, excluirAction, excluindo] = useActionState(
    excluirPeriodoAction,
    {}
  )

  const erro = estado.erro ?? estadoExcluir.erro
  const voltar = periodo
    ? `/painel/pessoal/ferias/${periodo.id}`
    : "/painel/pessoal/ferias"

  return (
    <div className="grid gap-4">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <form action={formAction} className="grid gap-4">
        {periodo && <input type="hidden" name="id" value={periodo.id} />}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados do período</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            {periodo ? (
              <div className="grid gap-1.5">
                <Label>Funcionário</Label>
                <Input
                  value={periodo.funcionarioNome ?? "(sem nome)"}
                  disabled
                />
                <input
                  type="hidden"
                  name="trabalhador_id"
                  value={periodo.trabalhador_id ?? ""}
                />
              </div>
            ) : (
              <div className="grid gap-1.5">
                <Label htmlFor="trabalhador_id">Funcionário *</Label>
                <select
                  id="trabalhador_id"
                  name="trabalhador_id"
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
              <Label htmlFor="dias_disponiveis">Dias de direito *</Label>
              <Input
                id="dias_disponiveis"
                name="dias_disponiveis"
                inputMode="numeric"
                defaultValue={periodo?.dias_disponiveis ?? 30}
                required
              />
              <p className="text-muted-foreground text-xs">
                30 por padrão — reduza conforme as faltas injustificadas do
                período aquisitivo (CLT art. 130).
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="aquisitivo_inicio">Aquisitivo — início *</Label>
                <Input
                  id="aquisitivo_inicio"
                  name="aquisitivo_inicio"
                  type="date"
                  required
                  defaultValue={periodo?.aquisitivo_inicio ?? ""}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="aquisitivo_termino">Término</Label>
                <Input
                  id="aquisitivo_termino"
                  name="aquisitivo_termino"
                  type="date"
                  defaultValue={periodo?.aquisitivo_termino ?? ""}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="concessivo_inicio">Concessivo — início</Label>
                <Input
                  id="concessivo_inicio"
                  name="concessivo_inicio"
                  type="date"
                  defaultValue={periodo?.concessivo_inicio ?? ""}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="concessivo_termino">Término</Label>
                <Input
                  id="concessivo_termino"
                  name="concessivo_termino"
                  type="date"
                  defaultValue={periodo?.concessivo_termino ?? ""}
                />
              </div>
            </div>

            <p className="text-muted-foreground -mt-2 text-xs sm:col-span-2">
              Datas em branco são completadas: aquisitivo de 1 ano; concessivo
              nos 12 meses seguintes.
            </p>

            <div className="flex flex-wrap content-end gap-4 pb-1 sm:col-span-2">
              <label className="text-muted-foreground flex items-center gap-2 text-sm">
                <Checkbox
                  name="abono_pecuniario"
                  defaultChecked={periodo?.abono_pecuniario === true}
                />
                Abono pecuniário (vende 1/3 — o descanso cai para 2/3)
              </label>
              <label className="text-muted-foreground flex items-center gap-2 text-sm">
                <Checkbox
                  name="finalizado"
                  defaultChecked={periodo?.finalizado === true}
                />
                Período finalizado
              </label>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" asChild>
            <Link href={voltar}>Cancelar</Link>
          </Button>
          <Button type="submit" disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            {periodo ? "Salvar alterações" : "Criar período"}
          </Button>
        </div>
      </form>

      {periodo && (
        <form
          action={excluirAction}
          onSubmit={(e) => {
            if (
              !confirm(
                "Excluir este período de férias? Só é possível excluir períodos sem gozos."
              )
            ) {
              e.preventDefault()
            }
          }}
          className="flex justify-end border-t pt-4"
        >
          <input type="hidden" name="id" value={periodo.id} />
          <Button
            type="submit"
            variant="ghost"
            disabled={excluindo || periodo.gozos > 0}
            className="text-destructive hover:text-destructive"
          >
            {excluindo ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Excluir período
          </Button>
        </form>
      )}
    </div>
  )
}
