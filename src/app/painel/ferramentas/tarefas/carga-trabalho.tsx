import Link from "next/link"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { CargaPessoa } from "@/lib/nucleo-constantes"

const BASE = "/painel/ferramentas/tarefas"

function Numero({ valor, href, perigo }: { valor: number; href?: string; perigo?: boolean }) {
  if (valor === 0) return <span className="text-muted-foreground">—</span>
  const classe = `tabular-nums ${perigo ? "text-destructive font-semibold" : ""}`
  return href ? (
    <Link href={href} className={`${classe} hover:underline`}>
      {valor}
    </Link>
  ) : (
    <span className={classe}>{valor}</span>
  )
}

/**
 * Carga de trabalho por pessoa: as tarefas abertas de cada responsável, por
 * prazo. A barra compara com quem tem mais; o número leva à lista da pessoa.
 */
export function CargaTrabalho({ carga }: { carga: CargaPessoa[] }) {
  if (carga.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">Nenhuma tarefa aberta.</p>
  }
  const maior = Math.max(...carga.map((c) => c.abertas))
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Responsável</TableHead>
          <TableHead className="w-48">Abertas</TableHead>
          <TableHead className="text-right">Atrasadas</TableHead>
          <TableHead className="text-right">Vencem nesta semana</TableHead>
          <TableHead className="text-right">Na próxima</TableHead>
          <TableHead className="text-right">Sem prazo</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {carga.map((c) => {
          const lista = c.id ? `${BASE}?responsavel=${c.id}` : undefined
          return (
            <TableRow key={c.id ?? "sem"}>
              <TableCell className="font-medium">
                {lista ? (
                  <Link href={lista} className="hover:underline">
                    {c.nome}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{c.nome}</span>
                )}
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="bg-muted h-2 flex-1 overflow-hidden rounded-full" aria-hidden>
                    <div className="bg-primary h-full" style={{ width: `${(c.abertas / maior) * 100}%` }} />
                  </div>
                  <span className="w-6 text-right tabular-nums">{c.abertas}</span>
                </div>
              </TableCell>
              <TableCell className="text-right">
                <Numero valor={c.atrasadas} perigo href={c.id ? `${BASE}?status=atrasadas&responsavel=${c.id}` : undefined} />
              </TableCell>
              <TableCell className="text-right">
                <Numero valor={c.estaSemana} />
              </TableCell>
              <TableCell className="text-right">
                <Numero valor={c.proximaSemana} />
              </TableCell>
              <TableCell className="text-right">
                <Numero valor={c.semPrazo} />
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
