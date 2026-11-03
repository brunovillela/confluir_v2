import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Plus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarTabelasSalariais } from "@/lib/db/tabelas-salariais"
import { formatarData } from "@/lib/formato"
import { rotuloTabelaSalarial } from "@/lib/tabela-salarial"

export const metadata: Metadata = { title: "Tabelas salariais — Confluir" }

export default async function TabelasSalariaisPage({
  searchParams,
}: {
  searchParams: Promise<{ excluida?: string }>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_niveis_salariais"])
  const { excluida } = await searchParams
  const tabelas = await listarTabelasSalariais()
  const semVigencia = tabelas.find((t) => !t.data_inicio)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/niveis">
            <ArrowLeft />
            Níveis salariais
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Tabelas salariais</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Cada tabela guarda os degraus de um período. Os lançamentos e o reajuste trabalham com a vigente.
            </p>
          </div>
          <Button asChild>
            <Link href="/painel/pessoal/niveis/tabelas/nova">
              <Plus />
              Nova tabela
            </Link>
          </Button>
        </div>
      </div>

      {excluida === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Tabela excluída.</AlertDescription>
        </Alert>
      )}
      {semVigencia && (
        <Alert variant="warning">
          <AlertDescription>
            A tabela atual ainda não tem vigência.{" "}
            <Link href={`/painel/pessoal/niveis/tabelas/${semVigencia.id}`} className="underline underline-offset-4">
              Informe o início e o término
            </Link>{" "}
            para ela ganhar o nome.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tabelas</CardTitle>
          <CardDescription>Abra uma tabela para ver a vigência e torná-la a vigente.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Nome</TableHead>
                  <TableHead>Início</TableHead>
                  <TableHead>Término</TableHead>
                  <TableHead className="text-right">Degraus</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tabelas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground h-20 text-center text-sm">
                      Nenhuma tabela cadastrada.
                    </TableCell>
                  </TableRow>
                )}
                {tabelas.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      <Link href={`/painel/pessoal/niveis/tabelas/${t.id}`} className="hover:underline">
                        {rotuloTabelaSalarial(t)}
                      </Link>
                    </TableCell>
                    <TableCell className="tabular-nums">{formatarData(t.data_inicio)}</TableCell>
                    <TableCell className="tabular-nums">{formatarData(t.data_fim)}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.degraus}</TableCell>
                    <TableCell>
                      {t.vigente ? (
                        <Badge variant="outline" className="border-success/40 text-success-fg">
                          Vigente
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Guardada
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <Button variant="ghost" size="sm" asChild className="h-7 px-2">
                          <Link href={`/painel/pessoal/niveis/tabela?tabela=${t.id}`}>Ver degraus</Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
