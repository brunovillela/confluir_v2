"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { removerPagamento, salvarPagamento } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type CentroOpcao = {
  id: string
  rotulo: string
}

/** CRUD do pagamento da ordem: valor, data, comprovante (PDF) e centro de custo da receita. */
export function PagamentoForm({
  ordemId,
  valorPago,
  dataPagamento,
  centroReceitaId,
  temComprovante,
  temPagamento,
  centros,
  podeEditar = true,
}: {
  ordemId: string
  valorPago: number | null
  dataPagamento: string | null
  centroReceitaId: string | null
  temComprovante: boolean
  temPagamento: boolean
  centros: CentroOpcao[]
  podeEditar?: boolean
}) {
  const [estado, salvarAction, salvando] = useActionState(salvarPagamento, {})
  const [estadoRemover, removerAction, removendo] = useActionState(
    removerPagamento,
    {}
  )

  const erro = estado.erro ?? estadoRemover.erro

  if (!podeEditar) return null

  return (
    <div className="grid gap-4">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <form action={salvarAction} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="id" value={ordemId} />
        <div className="grid gap-1.5">
          <Label htmlFor="valor_pago">Valor do pagamento (R$) *</Label>
          <Input
            id="valor_pago"
            name="valor_pago"
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={
              valorPago === null
                ? ""
                : valorPago.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
            }
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="data_pagamento">Data do pagamento *</Label>
          <Input
            id="data_pagamento"
            name="data_pagamento"
            type="date"
            defaultValue={dataPagamento ?? ""}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="comprovante">
            Comprovante de pagamento (PDF{temComprovante ? " — substitui o atual" : ""})
          </Label>
          <Input
            id="comprovante"
            name="comprovante"
            type="file"
            accept="application/pdf"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="centro_custo_receita_id">Centro de custo da receita</Label>
          <select
            id="centro_custo_receita_id"
            name="centro_custo_receita_id"
            defaultValue={centroReceitaId ?? ""}
            className={SELECT}
          >
            <option value="">Não informado</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-end gap-2 sm:col-span-2">
          <Button variant="ghost" asChild>
            <Link href={`/painel/financeiro/ordens/${ordemId}`}>Cancelar</Link>
          </Button>
          <Button type="submit" disabled={salvando}>
            {salvando && <Loader2 className="animate-spin" />}
            {temPagamento ? "Salvar pagamento" : "Registrar pagamento"}
          </Button>
        </div>
      </form>

      {temPagamento && (
        <form
          action={removerAction}
          onSubmit={(e) => {
            if (
              !confirm(
                "Remover o registro de pagamento? Valor, data, comprovante e pagador serão limpos e a ordem deixa de constar como Paga."
              )
            ) {
              e.preventDefault()
            }
          }}
          className="flex justify-end border-t pt-3"
        >
          <input type="hidden" name="id" value={ordemId} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={removendo}
            className="text-destructive hover:text-destructive"
          >
            {removendo ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Remover pagamento
          </Button>
        </form>
      )}
    </div>
  )
}
