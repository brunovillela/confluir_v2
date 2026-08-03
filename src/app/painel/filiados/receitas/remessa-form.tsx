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

import { atualizarRemessa, criarRemessa, excluirRemessa } from "./actions"
import { MESES, TIPOS_REMESSA } from "./remessa-constantes"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type RemessaFormDados = {
  id: string
  ano: string | null
  ordem: number | null
  tipo: string | null
  aberto: boolean | null
}

export function RemessaForm({ remessa }: { remessa?: RemessaFormDados }) {
  const [estado, formAction, pendente] = useActionState(
    remessa ? atualizarRemessa : criarRemessa,
    {}
  )
  const [estadoExcluir, excluirAction, excluindo] = useActionState(
    excluirRemessa,
    {}
  )

  const erro = estado.erro ?? estadoExcluir.erro
  const mesAtual = remessa?.ordem ? remessa.ordem % 100 : undefined
  const anoAtual = remessa?.ordem
    ? Math.floor(remessa.ordem / 100)
    : Number(remessa?.ano) || undefined

  return (
    <div className="grid gap-4">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <form action={formAction} className="grid gap-4">
        {remessa && (
          <input type="hidden" name="remessa_id" value={remessa.id} />
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados da remessa</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="mes">Mês *</Label>
              <select
                id="mes"
                name="mes"
                required
                defaultValue={mesAtual ?? new Date().getMonth() + 1}
                className={SELECT}
              >
                {MESES.map((nome, i) => (
                  <option key={nome} value={i + 1}>
                    {String(i + 1).padStart(2, "0")} — {nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ano">Ano *</Label>
              <Input
                id="ano"
                name="ano"
                type="number"
                min={2000}
                max={2100}
                required
                defaultValue={anoAtual ?? new Date().getFullYear()}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tipo">Tipo *</Label>
              <select
                id="tipo"
                name="tipo"
                required
                defaultValue={remessa?.tipo ?? "Associativa"}
                className={SELECT}
              >
                {TIPOS_REMESSA.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <label className="text-muted-foreground flex items-center gap-2 text-sm sm:col-span-3">
              <Checkbox
                name="aberto"
                defaultChecked={remessa ? remessa.aberto === true : true}
              />
              Remessa aberta (ainda recebe lançamentos)
            </label>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" asChild>
            <Link
              href={
                remessa
                  ? `/painel/filiados/receitas/${remessa.id}`
                  : "/painel/filiados/receitas"
              }
            >
              Cancelar
            </Link>
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
                "Excluir esta remessa? Só é possível quando ela não tem lançamentos nem recebimentos."
              )
            ) {
              e.preventDefault()
            }
          }}
          className="flex justify-end border-t pt-4"
        >
          <input type="hidden" name="remessa_id" value={remessa.id} />
          <Button
            type="submit"
            variant="ghost"
            disabled={excluindo}
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
