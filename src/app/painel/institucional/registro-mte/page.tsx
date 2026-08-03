import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Landmark, Plus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { listarRegistros } from "@/lib/db/registro-mte"
import { formatarData } from "@/lib/formato"
import {
  ROTULO_TIPO_REGISTRO,
  type SituacaoRegistroMte,
} from "@/lib/registro-mte-constantes"

export const metadata: Metadata = { title: "Registro sindical (MTE) — Confluir" }

function BadgeSituacao({ situacao }: { situacao: SituacaoRegistroMte }) {
  if (situacao === "cancelado")
    return <Badge variant="outline" className="text-muted-foreground">Cancelado</Badge>
  if (situacao === "em_analise")
    return <Badge variant="warning">Em análise</Badge>
  return (
    <Badge variant="outline" className="border-success/40 text-success-fg">
      Ativo
    </Badge>
  )
}

export default async function RegistroMtePage({
  searchParams,
}: {
  searchParams: Promise<{ excluido?: string }>
}) {
  await requirePermissao("registro_mte")
  const { excluido } = await searchParams
  const registros = await listarRegistros()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional">
            <ArrowLeft />
            Institucional
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Registro sindical (MTE)
          </h1>
          <Button asChild>
            <Link href="/painel/institucional/registro-mte/novo">
              <Plus />
              Novo registro
            </Link>
          </Button>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Registros da entidade no Ministério do Trabalho e Emprego.
        </p>
      </div>

      {excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Registro excluído.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          {registros.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <Landmark className="mx-auto mb-2 size-5" />
              Nenhum registro cadastrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nº / registro</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {registros.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="max-w-56">
                      <Link
                        href={`/painel/institucional/registro-mte/${r.id}`}
                        className="text-primary line-clamp-1 font-medium hover:underline"
                      >
                        {r.numero ?? "(sem número)"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {ROTULO_TIPO_REGISTRO[r.tipo]}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-40">
                      <span className="line-clamp-1 text-sm">
                        {r.categoria ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {r.data_registro ? formatarData(r.data_registro) : "—"}
                    </TableCell>
                    <TableCell>
                      <BadgeSituacao situacao={r.situacao} />
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
