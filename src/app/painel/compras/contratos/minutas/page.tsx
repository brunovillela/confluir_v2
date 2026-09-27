import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, FilePen, Plus } from "lucide-react"

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
import { rotuloTipoMinuta } from "@/lib/contratos-minutas-constantes"
import { AVISO_SQL_MINUTAS, listarMinutas } from "@/lib/db/contratos-minutas"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = { title: "Minutas de contrato — Confluir" }

export default async function MinutasPage({
  searchParams,
}: {
  searchParams: Promise<{ excluida?: string }>
}) {
  await requirePermissao("aquisicoes_contratos_edicao")
  const sp = await searchParams
  const { disponivel, minutas } = await listarMinutas()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras/contratos">
            <ArrowLeft />
            Contratos
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Minutas de contrato</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              A IA redige a minuta com os dados que você informa; você revisa, pede ajustes e baixa em
              PDF ou Word
            </p>
          </div>
          {disponivel && (
            <Button asChild>
              <Link href="/painel/compras/contratos/minutas/nova">
                <Plus />
                Nova minuta
              </Link>
            </Button>
          )}
        </div>
      </div>

      {sp.excluida === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Minuta excluída.</AlertDescription>
        </Alert>
      )}
      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>{AVISO_SQL_MINUTAS}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          {minutas.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
              <FilePen className="size-6" />
              Nenhuma minuta ainda.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Minuta</TableHead>
                  <TableHead className="hidden md:table-cell">Tipo</TableHead>
                  <TableHead className="hidden md:table-cell">Contrato</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="hidden text-right sm:table-cell">Atualizada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {minutas.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="max-w-80">
                      <Link
                        href={`/painel/compras/contratos/minutas/${m.id}`}
                        className="font-medium hover:underline"
                      >
                        <span className="block truncate">{m.titulo ?? "(sem título)"}</span>
                      </Link>
                      {m.outraParte && (
                        <span className="text-muted-foreground block truncate text-xs">{m.outraParte}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-sm md:table-cell">
                      {rotuloTipoMinuta(m.tipo)}
                    </TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      {m.contratoId ? (
                        <Link
                          href={`/painel/compras/contratos/${m.contratoId}`}
                          className="font-mono text-xs hover:underline"
                        >
                          {m.contratoCodigo ?? "Contrato"}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {m.finalizada ? (
                          <Badge variant="outline" className="border-success/40 text-success-fg">
                            Finalizada
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            Rascunho · v{m.versao}
                          </Badge>
                        )}
                        {m.pendencias > 0 && (
                          <Badge variant="outline" className="border-warning/40 text-warning-fg">
                            {m.pendencias} a preencher
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden text-right text-sm whitespace-nowrap sm:table-cell">
                      {formatarData(m.updatedAt)}
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
