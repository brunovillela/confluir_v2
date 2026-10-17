import Link from "next/link"
import { FileBadge } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { RemessaInformes } from "@/lib/db/informes"
import { formatarData } from "@/lib/formato"

/** Aba "Remessas" dos Informes: uma por ano-base. */
export function ListaRemessasInformes({ remessas }: { remessas: RemessaInformes[] }) {
  return (
    <>
      <p className="text-muted-foreground text-xs">
        {remessas.length} remessa{remessas.length === 1 ? "" : "s"} — uma por ano-base; cada remessa agrupa os informes dos
        funcionários
      </p>
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
                    <p className="text-sm">Nenhuma remessa de informes de rendimentos.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {remessas.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <Link href={`/painel/pessoal/informes/${r.id}`} className="hover:underline">
                    Ano-base {r.ano_referencia_os ?? "(sem ano)"}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground hidden md:table-cell">{formatarData(r.created_at)}</TableCell>
                <TableCell className="text-right tabular-nums">{r.itens.toLocaleString("pt-BR")}</TableCell>
                <TableCell>
                  {r.fechada === true ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      Fechada
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-success/40 text-success-fg">
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
