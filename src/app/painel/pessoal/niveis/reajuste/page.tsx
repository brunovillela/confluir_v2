import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Percent } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { requirePermissao } from "@/lib/auth"
import {
  listarNivelSalarialBase,
  rotuloNivelSalarial,
} from "@/lib/db/carreira"
import { formatarMoeda } from "@/lib/formato"

import { lerPercentualReajuste } from "../actions"
import { ReajusteConfirmarForm } from "./reajuste-form"

export const metadata: Metadata = { title: "Reajuste salarial — Confluir" }

const AMOSTRA = 8

export default async function ReajustePage({
  searchParams,
}: {
  searchParams: Promise<{ percentual?: string }>
}) {
  // Mexe em todos os salários da entidade — exclusivo da gestão de pessoal.
  await requirePermissao("pessoal_gestao")

  const { percentual: bruto = "" } = await searchParams
  const pct = bruto ? await lerPercentualReajuste(bruto) : null
  const base = await listarNivelSalarialBase()
  const comSalario = base.filter((b) => b.salario_base !== null)

  const fator = pct === null ? 1 : 1 + pct / 100
  const novo = (v: number) => Math.round(v * fator * 100) / 100

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/niveis">
            <ArrowLeft />
            Níveis salariais
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Reajuste salarial
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Aplica o percentual negociado em acordo coletivo de forma linear a
          todos os {comSalario.length} degraus da tabela salarial, em todos os
          cargos.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Percentual do reajuste</CardTitle>
          <CardDescription>
            Informe o percentual e confira a prévia antes de aplicar. Aceita
            negativo (ex.: correção de aplicação indevida).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="GET" className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="percentual">Reajuste (%)</Label>
              <Input
                id="percentual"
                name="percentual"
                inputMode="decimal"
                placeholder="Ex.: 4,5"
                defaultValue={bruto}
                className="w-40"
                required
              />
            </div>
            <Button type="submit" variant="secondary">
              <Percent />
              Calcular prévia
            </Button>
          </form>
          {bruto && pct === null && (
            <Alert variant="destructive" className="mt-4">
              <AlertDescription>
                Percentual inválido — use um número entre -50 e 100, diferente
                de zero (ex.: 4,5).
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {pct !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Prévia — reajuste de{" "}
              {pct.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%
            </CardTitle>
            <CardDescription>
              Amostra de {Math.min(AMOSTRA, comSalario.length)} dos{" "}
              {comSalario.length} degraus que serão reajustados. Funcionários
              com nível salarial lançado recebem aviso no sino de notificações.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Nível</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Cargo
                    </TableHead>
                    <TableHead className="text-right">Salário atual</TableHead>
                    <TableHead className="text-right">
                      Salário reajustado
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comSalario.slice(0, AMOSTRA).map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {rotuloNivelSalarial(b)}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden max-w-48 truncate sm:table-cell">
                        {b.cargoNome ?? "—"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {formatarMoeda(b.salario_base)}
                      </TableCell>
                      <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                        {formatarMoeda(novo(b.salario_base!))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <ReajusteConfirmarForm
              percentualTexto={pct.toLocaleString("pt-BR", {
                maximumFractionDigits: 2,
              })}
              degraus={comSalario.length}
            />
          </CardContent>
        </Card>
      )}
    </>
  )
}
