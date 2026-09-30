import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { ResumoEstorno } from "@/lib/db/ordens-estorno"
import { formatarData, formatarMoeda } from "@/lib/formato"

export function TabelaEstornos({
  estornos,
  mostrarResponsavel = true,
}: {
  estornos: ResumoEstorno[]
  mostrarResponsavel?: boolean
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Ordem</TableHead>
          <TableHead className="whitespace-nowrap">Estorno</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead className="hidden md:table-cell">Motivo</TableHead>
          {mostrarResponsavel && <TableHead className="hidden lg:table-cell">Quem confere</TableHead>}
          <TableHead>Situação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {estornos.map((e) => (
          <TableRow key={e.id}>
            <TableCell className="max-w-72">
              <Link href={`/painel/estornos/${e.id}`} className="text-primary font-medium hover:underline">
                {e.ordemCodigo ?? "(sem código)"}
              </Link>
              <span className="text-muted-foreground block truncate text-xs">{e.ordemDescricao ?? ""}</span>
            </TableCell>
            <TableCell className="whitespace-nowrap">{formatarData(e.dataEstorno)}</TableCell>
            <TableCell className="text-right tabular-nums">{formatarMoeda(e.valor)}</TableCell>
            <TableCell className="text-muted-foreground hidden max-w-80 truncate md:table-cell" title={e.motivo}>
              {e.motivo}
            </TableCell>
            {mostrarResponsavel && (
              <TableCell className="hidden lg:table-cell">{e.responsavel ?? "Financeiro"}</TableCell>
            )}
            <TableCell>
              {e.resolvidoEm ? (
                <Badge variant="outline" className="border-success/40 text-success-fg whitespace-nowrap">
                  Resolvido {formatarData(e.resolvidoEm.slice(0, 10))}
                </Badge>
              ) : (
                <Badge variant="outline" className="border-warning/50 text-warning-fg">
                  Pendente
                </Badge>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
