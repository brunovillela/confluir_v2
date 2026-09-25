import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Plus, ReceiptText } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { itensFaturaveis, listarFaturas } from "@/lib/db/viagens-faturas"
import { formatarData, formatarMoeda } from "@/lib/formato"

export const metadata: Metadata = { title: "Faturas de viagens — Confluir" }

/** Faturas das agências já lançadas, com a ordem de pagamento de cada uma. */
export default async function FaturasViagensPage({
  searchParams,
}: {
  searchParams: Promise<{ desfeita?: string }>
}) {
  await requirePermissao("viagens_gestao")
  const [{ desfeita }, { disponivel, faturas }, { itens }] = await Promise.all([
    searchParams,
    listarFaturas(),
    itensFaturaveis(),
  ])

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
            <Link href="/painel/viagens">
              <ArrowLeft />
              Passagens e hospedagens
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Faturas</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Cada fatura vira uma aquisição direta em Compras e uma ordem de pagamento com o
            rateio por conta.
          </p>
        </div>
        {disponivel && (
          <Button asChild>
            <Link href="/painel/viagens/faturas/nova">
              <Plus />
              Nova fatura
              {itens.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {itens.length} a faturar
                </Badge>
              )}
            </Link>
          </Button>
        )}
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>
            As faturas ainda não existem no banco — rode supabase/viagens-faturas.sql.
          </AlertDescription>
        </Alert>
      )}
      {desfeita === "1" && (
        <Alert variant="success">
          <AlertDescription>
            Fatura desfeita — a ordem e a compra foram apagadas e os itens voltaram para
            &ldquo;a faturar&rdquo;.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Lançadas</CardTitle>
            <ReceiptText className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            {faturas.length} fatura{faturas.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {faturas.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhuma fatura lançada ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fatura</TableHead>
                    <TableHead>Agência</TableHead>
                    <TableHead className="hidden sm:table-cell">Emissão</TableHead>
                    <TableHead className="hidden md:table-cell">Vencimento</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Pagamento</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {faturas.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>
                        <Link
                          href={`/painel/viagens/faturas/${f.id}`}
                          className="text-primary font-medium hover:underline"
                        >
                          {f.numero}
                        </Link>
                      </TableCell>
                      <TableCell>{f.fornecedorNome ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground hidden sm:table-cell">
                        {formatarData(f.emissao)}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden md:table-cell">
                        {f.vencimento ? formatarData(f.vencimento) : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatarMoeda(f.valorTotal)}
                      </TableCell>
                      <TableCell>
                        {f.ordemId ? (
                          <Link
                            href={`/painel/financeiro/ordens/${f.ordemId}`}
                            className="hover:text-primary text-sm"
                          >
                            {f.ordemSituacao ?? "—"}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
