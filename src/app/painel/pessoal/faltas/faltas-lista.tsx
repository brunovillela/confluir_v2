import Link from "next/link"
import { CalendarCheck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { FaltaJustificada } from "@/lib/db/faltas"
import type { SituacaoFalta } from "@/lib/faltas-constantes"
import { formatarData } from "@/lib/formato"

import { ExcluirFaltaBotao } from "./faltas-forms"
import { BadgeFalta, LinkComprovacao } from "./faltas-ui"

/** Aba "Faltas do ano" (a lista de antes do padrão de 3 níveis). */
export function ListaFaltasAno({
  doAno,
  ano,
  anos,
  brutos,
  funcionarios,
}: {
  doAno: FaltaJustificada[]
  ano: string
  anos: string[]
  brutos: Record<string, string | undefined>
  funcionarios: { usuarioId: string; nome: string }[]
}) {
  const situacao = ["aguardando", "autorizada", "recusada"].includes(brutos.situacao ?? "")
    ? (brutos.situacao as SituacaoFalta)
    : null
  const lista = doAno.filter(
    (f) => (!brutos.funcionario || f.funcionarioId === brutos.funcionario) && (!situacao || f.situacao === situacao)
  )

  return (
    <>
      <form method="GET" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="aba" value="faltas" />
        <SelectNativo name="ano" defaultValue={ano} aria-label="Ano" className="h-9 w-auto">
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="funcionario" defaultValue={brutos.funcionario ?? ""} aria-label="Funcionário" className="h-9 w-auto max-w-64">
          <option value="">Todos os funcionários</option>
          {funcionarios.map((f) => (
            <option key={f.usuarioId} value={f.usuarioId}>
              {f.nome}
            </option>
          ))}
        </SelectNativo>
        <SelectNativo name="situacao" defaultValue={situacao ?? ""} aria-label="Situação" className="h-9 w-auto">
          <option value="">Todas as situações</option>
          <option value="aguardando">Aguardando</option>
          <option value="autorizada">Autorizadas</option>
          <option value="recusada">Recusadas</option>
        </SelectNativo>
        <Button type="submit" variant="secondary" size="sm">
          Filtrar
        </Button>
        <span className="text-muted-foreground text-xs">{lista.length} registro(s)</span>
      </form>
      {lista.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-sm">
          <CalendarCheck className="size-6" />
          Nenhuma falta com estes filtros.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Data</TableHead>
                <TableHead>Funcionário</TableHead>
                <TableHead>Justificativa</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="hidden md:table-cell">Comprovação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="whitespace-nowrap">
                    <Link href={`/painel/pessoal/faltas/${f.id}?de=faltas`} className="hover:underline">
                      {formatarData(f.data)}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-48">
                    {f.funcionarioId ? (
                      <Link href={`/painel/pessoal/faltas/funcionario/${f.funcionarioId}`} className="line-clamp-1 hover:underline">
                        {f.funcionarioNome ?? "—"}
                      </Link>
                    ) : (
                      <span className="line-clamp-1">{f.funcionarioNome ?? "—"}</span>
                    )}
                  </TableCell>
                  <TableCell className="max-w-72">
                    <span className="line-clamp-2 text-sm">{f.tipo ?? "—"}</span>
                    {f.situacao === "recusada" && f.motivoRecusa && (
                      <span className="text-destructive line-clamp-2 text-xs">Recusa: {f.motivoRecusa}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <BadgeFalta situacao={f.situacao} />
                    {f.autorizadorNome && f.situacao !== "aguardando" && (
                      <span className="text-muted-foreground block text-xs">
                        {f.autorizadorNome}
                        {f.dataAutorizacao ? `, ${formatarData(f.dataAutorizacao)}` : ""}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <LinkComprovacao caminho={f.comprovacao} />
                  </TableCell>
                  <TableCell className="text-right">
                    <ExcluirFaltaBotao id={f.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
