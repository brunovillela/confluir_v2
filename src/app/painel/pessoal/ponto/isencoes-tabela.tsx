import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { hojeEmBrasilia } from "@/lib/assembleias-constantes"
import { periodoIsencao, situacaoIsencao, type IsencaoPonto } from "@/lib/db/ponto-isencoes"
import { formatarData } from "@/lib/formato"

import { EncerrarIsencaoBotao, ExcluirIsencaoBotao } from "./isencoes-form"

const SITUACAO = {
  vigente: { rotulo: "Vigente", classe: "border-success/40 text-success-fg" },
  futura: { rotulo: "Futura", classe: "border-primary/40 text-primary" },
  encerrada: { rotulo: "Encerrada", classe: "text-muted-foreground" },
} as const

/** Histórico das isenções de registro de ponto (da entidade ou de um funcionário). */
export function TabelaIsencoes({ isencoes, comFuncionario = true }: { isencoes: IsencaoPonto[]; comFuncionario?: boolean }) {
  const hoje = hojeEmBrasilia()
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            {comFuncionario && <TableHead>Funcionário</TableHead>}
            <TableHead>Período</TableHead>
            <TableHead>Justificativa</TableHead>
            <TableHead>Registro</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead className="text-right">Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isencoes.length === 0 && (
            <TableRow>
              <TableCell colSpan={comFuncionario ? 6 : 5} className="text-muted-foreground h-16 text-center text-sm">
                Nenhuma isenção registrada.
              </TableCell>
            </TableRow>
          )}
          {isencoes.map((i) => {
            const s = situacaoIsencao(i, hoje)
            return (
              <TableRow key={i.id}>
                {comFuncionario && (
                  <TableCell className="max-w-52 truncate font-medium">
                    <Link href={`/painel/pessoal/ponto/funcionario/${i.funcionarioId}`} className="hover:underline">
                      {i.funcionarioNome}
                    </Link>
                  </TableCell>
                )}
                <TableCell className="whitespace-nowrap tabular-nums">{periodoIsencao(i)}</TableCell>
                <TableCell className="max-w-96 text-sm whitespace-pre-line">{i.justificativa}</TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {formatarData(i.createdAt)}
                  {i.registradoPorNome && ` por ${i.registradoPorNome}`}
                  {i.encerradoEm && (
                    <span className="block">
                      Encerrada em {formatarData(i.encerradoEm)}
                      {i.encerradoPorNome && ` por ${i.encerradoPorNome}`}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={SITUACAO[s].classe}>
                    {SITUACAO[s].rotulo}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    {s !== "encerrada" && <EncerrarIsencaoBotao id={i.id} hoje={hoje < i.inicio ? i.inicio : hoje} />}
                    <ExcluirIsencaoBotao id={i.id} />
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
