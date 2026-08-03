import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, FileBadge, Plus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarRemessasInformes } from "@/lib/db/informes"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = {
  title: "Informes de rendimentos — Confluir",
}

export default async function InformesPage({
  searchParams,
}: {
  searchParams: Promise<{ excluida?: string }>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_informes_rendimentos"])

  const { excluida } = await searchParams
  const remessas = await listarRemessasInformes()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal">
            <ArrowLeft />
            Pessoal
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Informes de rendimentos
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {remessas.length} remessa{remessas.length === 1 ? "" : "s"} — uma
              por ano-base; cada remessa agrupa os informes dos funcionários
            </p>
          </div>
          <Button asChild>
            <Link href="/painel/pessoal/informes/nova">
              <Plus />
              Nova remessa
            </Link>
          </Button>
        </div>
      </div>

      {excluida === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Remessa excluída.</AlertDescription>
        </Alert>
      )}

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Ano-base</TableHead>
              <TableHead className="hidden md:table-cell">Criada em</TableHead>
              <TableHead className="text-right">Informes</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {remessas.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-40">
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                    <FileBadge className="size-6" />
                    <p className="text-sm">
                      Nenhuma remessa de informes de rendimentos.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {remessas.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/painel/pessoal/informes/${r.id}`}
                    className="hover:underline"
                  >
                    Ano-base {r.ano_referencia_os ?? "(sem ano)"}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground hidden md:table-cell">
                  {formatarData(r.created_at)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.itens.toLocaleString("pt-BR")}
                </TableCell>
                <TableCell>
                  {r.fechada === true ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      Fechada
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-success/40 text-success-fg"
                    >
                      Aberta
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
