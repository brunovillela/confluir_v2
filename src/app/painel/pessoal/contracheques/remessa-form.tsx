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
  atualizarRemessaContracheques,
  criarRemessaContracheques,
  excluirRemessaContracheques,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type RemessaFormDados = {
  id: string
  nome_remessa: string | null
  finalizada: boolean | null
  decimo_terceiro: boolean | null
  ferias: boolean | null
  adiantamento: boolean | null
  complementar_mensal: boolean | null
  itens: number
}

const NATUREZAS = [
  { valor: "mensal", rotulo: "Mensal" },
  { valor: "adiantamento", rotulo: "Adiantamento" },
  { valor: "decimo_terceiro", rotulo: "13º salário" },
  { valor: "ferias", rotulo: "Férias" },
  { valor: "complementar_mensal", rotulo: "Complementar (mensal)" },
]

function naturezaAtual(r?: RemessaFormDados): string {
  if (!r) return ""
  if (r.decimo_terceiro === true) return "decimo_terceiro"
  if (r.ferias === true) return "ferias"
  if (r.adiantamento === true) return "adiantamento"
  if (r.complementar_mensal === true) return "complementar_mensal"
  return "mensal"
}

export function RemessaContrachequesForm({
  remessa,
}: {
  remessa?: RemessaFormDados
}) {
  const [estado, formAction, pendente] = useActionState(
    remessa ? atualizarRemessaContracheques : criarRemessaContracheques,
    {}
  )
  const [estadoExcluir, excluirAction, excluindo] = useActionState(
    excluirRemessaContracheques,
    {}
  )

  const erro = estado.erro ?? estadoExcluir.erro
  const voltar = remessa
    ? `/painel/pessoal/contracheques/${remessa.id}`
    : "/painel/pessoal/contracheques"

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
              <Label htmlFor="nome_remessa">Nome da remessa *</Label>
              <Input
                id="nome_remessa"
                name="nome_remessa"
                placeholder="Ex.: Julho/2026 - Mensal"
                defaultValue={remessa?.nome_remessa ?? ""}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="natureza">Natureza *</Label>
              <select
                id="natureza"
                name="natureza"
                required
                defaultValue={naturezaAtual(remessa)}
                className={SELECT}
              >
                <option value="" disabled>
                  Escolha a natureza
                </option>
                {NATUREZAS.map((n) => (
                  <option key={n.valor} value={n.valor}>
                    {n.rotulo}
                  </option>
                ))}
              </select>
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
                "Excluir esta remessa? Só é possível excluir remessas sem contracheques."
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
