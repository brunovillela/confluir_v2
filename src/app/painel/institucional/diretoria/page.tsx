import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Users } from "lucide-react"

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
import { listarMandatos } from "@/lib/db/diretoria"
import { formatarData } from "@/lib/formato"

import { MandatoForm } from "./diretoria-forms"

export const metadata: Metadata = { title: "Diretoria — Confluir" }

export default async function DiretoriaPage() {
  await requirePermissao("diretoria_mandatos", ["configuracoes"])
  const mandatos = await listarMandatos()

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/institucional">
            <ArrowLeft />
            Institucional
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Diretoria</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Mandatos e integrantes — os signatários de ofícios saem do mandato vigente
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <p className="mb-3 text-sm font-medium">Novo mandato</p>
          <MandatoForm />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {mandatos.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <Users className="mx-auto mb-2 size-5" />
              Nenhum mandato cadastrado. Crie o mandato vigente acima.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mandato</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Integrantes</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mandatos.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Link
                        href={`/painel/institucional/diretoria/${m.id}`}
                        className="text-primary font-medium hover:underline"
                      >
                        {m.mandato ?? "(sem nome)"}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {m.dataInicio ? formatarData(m.dataInicio) : "?"}
                      {" – "}
                      {m.dataTermino ? formatarData(m.dataTermino) : "?"}
                    </TableCell>
                    <TableCell className="tabular-nums text-sm">
                      {m.integrantes}
                    </TableCell>
                    <TableCell>
                      {m.vigente ? (
                        <Badge variant="outline" className="border-success/40 text-success-fg">
                          Vigente
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          —
                        </Badge>
                      )}
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
