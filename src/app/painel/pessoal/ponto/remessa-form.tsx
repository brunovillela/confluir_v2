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
  atualizarRemessaPonto,
  criarRemessaPonto,
  excluirRemessaPonto,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const MESES = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
]

export type RemessaPontoFormDados = {
  id: string
  mes_referencia_os: string | null
  ano_referencia_os: string | null
  finalizada: boolean | null
  itens: number
}

export function RemessaPontoForm({ remessa }: { remessa?: RemessaPontoFormDados }) {
  const [estado, formAction, pendente] = useActionState(
    remessa ? atualizarRemessaPonto : criarRemessaPonto,
    {}
  )
  const [estadoExcluir, excluirAction, excluindo] = useActionState(
    excluirRemessaPonto,
    {}
  )

  const erro = estado.erro ?? estadoExcluir.erro
  const voltar = remessa
    ? `/painel/pessoal/ponto/${remessa.id}`
    : "/painel/pessoal/ponto"

  return (
    <div className="grid gap-4">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <form action={formAction} className="grid gap-4">
        {remessa && <input type="hidden" name="id" value={remessa.id} />}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados da remessa</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="mes_referencia_os">Mês de referência *</Label>
              <select
                id="mes_referencia_os"
                name="mes_referencia_os"
                required
                defaultValue={remessa?.mes_referencia_os ?? ""}
                className={SELECT}
              >
                <option value="" disabled>
                  Escolha o mês
                </option>
                {MESES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ano_referencia_os">Ano de referência *</Label>
              <Input
                id="ano_referencia_os"
                name="ano_referencia_os"
                inputMode="numeric"
                maxLength={4}
                placeholder="AAAA"
                defaultValue={remessa?.ano_referencia_os ?? ""}
                required
              />
            </div>
            <div className="grid content-end pb-1">
              <label className="text-muted-foreground flex items-center gap-2 text-sm">
                <Checkbox
                  name="finalizada"
                  defaultChecked={remessa?.finalizada === true}
                />
                Remessa finalizada
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
            {remessa ? "Salvar alterações" : "Criar remessa"}
          </Button>
        </div>
      </form>

      {remessa && (
        <form
          action={excluirAction}
          onSubmit={(e) => {
            if (
              !confirm(
                "Excluir esta remessa? Só é possível excluir remessas sem registros de ponto."
              )
            ) {
              e.preventDefault()
            }
          }}
          className="flex justify-end border-t pt-4"
        >
          <input type="hidden" name="id" value={remessa.id} />
          <Button
            type="submit"
            variant="ghost"
            disabled={excluindo || remessa.itens > 0}
            className="text-destructive hover:text-destructive"
          >
            {excluindo ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Excluir remessa
          </Button>
        </form>
      )}
    </div>
  )
}
