import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { formatarAliquota, listarAnuenioBase } from "@/lib/db/carreira"

import { AnuenioBaseForm, ExcluirDegrauBotao } from "./tabela-form"

export const metadata: Metadata = {
  title: "Tabela de alíquotas de anuênio — Confluir",
}

/** Alíquota (fração) → valor em % para edição: 0.046 → '4,6'. */
function aliquotaPct(v: number | null): string {
  if (v === null) return ""
  return (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 4 })
}

export default async function TabelaAnuenioPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string; editar?: string }>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_anuenios"])

  const { salvo, editar } = await searchParams
  const base = await listarAnuenioBase()
  const emEdicao = editar ? (base.find((b) => b.id === editar) ?? null) : null

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/anuenios">
            <ArrowLeft />
            Anuênios
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Tabela de alíquotas de anuênio
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {base.length} degrau{base.length === 1 ? "" : "s"} — cada ano de casa
          corresponde a uma alíquota aplicada ao salário básico
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Degrau salvo.</AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Degraus</CardTitle>
            <CardDescription>
              Degraus usados em lançamentos não podem ser excluídos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Nível (anos)</TableHead>
                    <TableHead className="text-right">Alíquota</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {base.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={3}
                        className="text-muted-foreground h-20 text-center text-sm"
                      >
                        Nenhum degrau cadastrado.
                      </TableCell>
                    </TableRow>
                  )}
                  {base.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium tabular-nums">
                        {b.nivel ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatarAliquota(b.aliquota)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="h-7 px-2"
                          >
                            <Link
                              href={`/painel/pessoal/anuenios/tabela?editar=${b.id}`}
                            >
                              Editar
                            </Link>
                          </Button>
                          <ExcluirDegrauBotao id={b.id} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* key força remontagem ao alternar criar/editar (defaultValue). */}
        <AnuenioBaseForm
          key={emEdicao?.id ?? "novo"}
          degrau={
            emEdicao
              ? {
                  id: emEdicao.id,
                  nivel: emEdicao.nivel,
                  aliquotaPct: aliquotaPct(emEdicao.aliquota),
                }
              : undefined
          }
        />
      </div>
    </>
  )
}
