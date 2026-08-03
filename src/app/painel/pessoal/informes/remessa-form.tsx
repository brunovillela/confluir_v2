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
  atualizarRemessaInformes,
  criarRemessaInformes,
  excluirRemessaInformes,
} from "./actions"

export type RemessaInformesFormDados = {
  id: string
  ano_referencia_os: string | null
  fechada: boolean | null
  itens: number
}

export function RemessaInformesForm({
  remessa,
}: {
  remessa?: RemessaInformesFormDados
}) {
  const [estado, formAction, pendente] = useActionState(
    remessa ? atualizarRemessaInformes : criarRemessaInformes,
    {}
  )
  const [estadoExcluir, excluirAction, excluindo] = useActionState(
    excluirRemessaInformes,
    {}
  )

  const erro = estado.erro ?? estadoExcluir.erro
  const voltar = remessa
    ? `/painel/pessoal/informes/${remessa.id}`
    : "/painel/pessoal/informes"

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
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="ano_referencia_os">Ano-base *</Label>
              <Input
                id="ano_referencia_os"
                name="ano_referencia_os"
                inputMode="numeric"
                placeholder="Ex.: 2025"
                defaultValue={remessa?.ano_referencia_os ?? ""}
                required
              />
              <p className="text-muted-foreground text-xs">
                Ano dos rendimentos declarados (uma remessa por ano).
              </p>
            </div>
            <div className="grid content-end pb-1">
              <label className="text-muted-foreground flex items-center gap-2 text-sm">
                <Checkbox
                  name="fechada"
                  defaultChecked={remessa?.fechada === true}
                />
                Remessa fechada
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
                "Excluir esta remessa? Só é possível excluir remessas sem informes."
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
