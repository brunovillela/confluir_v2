"use client"

import { useActionState } from "react"
import { Loader2, Plus, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { criarTarifa, excluirTarifa } from "../actions"

export type TarifaLinha = {
  id: string
  pessoas_por_quarto: number | null
  custo_por_filiado: number | null
  custo_entidade: number | null
}

function moeda(v: number | null) {
  return v === null
    ? "—"
    : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/** Tarifas do hotel: valores por acomodação (pessoas por quarto). */
export function Tarifas({
  hotelId,
  tarifas,
}: {
  hotelId: string
  tarifas: TarifaLinha[]
}) {
  const [estado, criarAction, criando] = useActionState(criarTarifa, {})
  const [estadoExcluir, excluirAction, excluindo] = useActionState(excluirTarifa, {})

  const erro = estado.erro ?? estadoExcluir.erro

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Tarifas por acomodação</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {erro && (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}

        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Pessoas por quarto</TableHead>
                <TableHead className="text-right">Custo por filiado</TableHead>
                <TableHead className="text-right">Custo da entidade</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tarifas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground h-20 text-center text-sm">
                    Nenhuma tarifa cadastrada para este hotel.
                  </TableCell>
                </TableRow>
              )}
              {tarifas.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="tabular-nums">
                    {t.pessoas_por_quarto ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {moeda(t.custo_por_filiado)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {moeda(t.custo_entidade)}
                  </TableCell>
                  <TableCell>
                    <form
                      action={excluirAction}
                      onSubmit={(e) => {
                        if (!confirm("Excluir esta tarifa?")) e.preventDefault()
                      }}
                    >
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="hotel_id" value={hotelId} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        disabled={excluindo}
                        aria-label="Excluir tarifa"
                        className="text-destructive hover:text-destructive size-8"
                      >
                        {excluindo ? <Loader2 className="animate-spin" /> : <Trash2 />}
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <form action={criarAction} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <input type="hidden" name="hotel_id" value={hotelId} />
          <div className="grid gap-1.5">
            <Label htmlFor="pessoas_por_quarto">Pessoas por quarto *</Label>
            <Input
              id="pessoas_por_quarto"
              name="pessoas_por_quarto"
              type="number"
              min={1}
              required
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="custo_por_filiado">Custo por filiado (R$)</Label>
            <Input
              id="custo_por_filiado"
              name="custo_por_filiado"
              inputMode="decimal"
              placeholder="0,00"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="custo_entidade">Custo da entidade (R$)</Label>
            <Input
              id="custo_entidade"
              name="custo_entidade"
              inputMode="decimal"
              placeholder="0,00"
            />
          </div>
          <Button type="submit" variant="secondary" disabled={criando}>
            {criando ? <Loader2 className="animate-spin" /> : <Plus />}
            Adicionar
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
