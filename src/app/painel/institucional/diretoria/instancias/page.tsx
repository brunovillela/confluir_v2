import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Building } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requirePermissao } from "@/lib/auth"
import { listarInstancias } from "@/lib/db/diretoria"

import { InstanciaForm } from "../diretoria-extra-forms"

export const metadata: Metadata = { title: "Instâncias — Confluir" }

export default async function InstanciasPage() {
  await requirePermissao("diretoria_mandatos", ["configuracoes"])
  const { disponivel, instancias } = await listarInstancias()

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/institucional/diretoria">
            <ArrowLeft />
            Diretoria
          </Link>
        </Button>
      </div>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Instâncias</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Entidades em que o sindicato tem assento, com os diretores que o
          representam
        </p>
      </div>

      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            As instâncias usam tabelas novas — rode{" "}
            <code>supabase/diretoria-liberacoes-instancias.sql</code> no Supabase.
          </AlertDescription>
        </Alert>
      )}

      {disponivel && (
        <>
          <GrupoColapsavel titulo="Nova instância">
            <InstanciaForm />
          </GrupoColapsavel>

          <Card>
            <CardContent>
              {instancias.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  <Building className="mx-auto mb-2 size-5" />
                  Nenhuma instância cadastrada.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Instância</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Assentos</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {instancias.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>
                          <Link
                            href={`/painel/institucional/diretoria/instancias/${i.id}`}
                            className="text-primary font-medium hover:underline"
                          >
                            {i.nome ?? "(sem nome)"}
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-96">
                          <span className="line-clamp-1">{i.descricao ?? "—"}</span>
                        </TableCell>
                        <TableCell className="tabular-nums">{i.assentos}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}
