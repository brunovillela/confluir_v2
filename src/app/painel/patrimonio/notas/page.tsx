import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Plus, Receipt } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarNotas } from "@/lib/db/patrimonio"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = { title: "Notas fiscais — Confluir" }

export default async function NotasPage() {
  await requirePermissao("patrimonio_geral")
  const notas = await listarNotas()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/patrimonio">
            <ArrowLeft />
            Patrimônio
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Notas fiscais
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Notas de entrada e saída dos bens patrimoniais
            </p>
          </div>
          <Button asChild>
            <Link href="/painel/patrimonio/notas/novo">
              <Plus />
              Nova nota
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent>
          {notas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <Receipt className="mx-auto mb-2 size-5" />
              Nenhuma nota fiscal cadastrada.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Emissão</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead className="text-right">Itens</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notas.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell>
                      <Link
                        href={`/painel/patrimonio/notas/${n.id}`}
                        className="text-primary font-medium whitespace-nowrap tabular-nums hover:underline"
                      >
                        {n.numero_nota ?? "(sem número)"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {n.entrada === false ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          Saída
                        </Badge>
                      ) : (
                        <Badge variant="outline">Entrada</Badge>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {n.data_emissao ? formatarData(n.data_emissao) : "—"}
                    </TableCell>
                    <TableCell className="max-w-72">
                      <span className="line-clamp-1">
                        {n.fornecedorNome ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {n.totalItens.toLocaleString("pt-BR")}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
