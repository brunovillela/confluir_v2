import Link from "next/link"
import { Users } from "lucide-react"

import { ColunaOrdenavel } from "@/components/coluna-ordenavel"
import { Paginacao } from "@/components/paginacao"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { FuncionarioBasico } from "@/lib/pessoal-area"

export type ColunaFuncionario<T> = {
  chave: string
  rotulo: string
  valor: (l: T) => React.ReactNode
  /** Classes da coluna (cabeçalho e células) — ex.: "text-right", "hidden md:table-cell". */
  className?: string
  /** Padrão: ordenável. */
  ordenavel?: boolean
}

/**
 * Lista de funcionários de uma área do Pessoal: a primeira coluna é sempre o
 * funcionário (nome → página dele na área, matrícula e departamento); as
 * demais vêm da área. Ordenação por clique no cabeçalho e paginação na URL.
 */
export function TabelaFuncionarios<T extends FuncionarioBasico>({
  pagina,
  colunas,
  hrefFuncionario,
  linkOrdem,
  ordem,
  dir,
  porPagina,
  padrao = 30,
  vazio = "Nenhum funcionário neste recorte.",
}: {
  pagina: { linhas: T[]; pagina: number; totalPaginas: number; total: number }
  colunas: ColunaFuncionario<T>[]
  hrefFuncionario: (l: T) => string
  linkOrdem: (chave: string) => string
  ordem: string
  dir: "asc" | "desc"
  porPagina: number
  padrao?: number
  vazio?: string
}) {
  return (
    <>
      <div className="overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <ColunaOrdenavel chave="nome" rotulo="Funcionário" ordem={ordem} dir={dir} href={linkOrdem} />
              {colunas.map((c) =>
                c.ordenavel === false ? (
                  <TableHead key={c.chave} className={c.className}>
                    {c.rotulo}
                  </TableHead>
                ) : (
                  <ColunaOrdenavel
                    key={c.chave}
                    chave={c.chave}
                    rotulo={c.rotulo}
                    ordem={ordem}
                    dir={dir}
                    href={linkOrdem}
                    className={c.className}
                  />
                )
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagina.total === 0 && (
              <TableRow>
                <TableCell colSpan={colunas.length + 1} className="h-32">
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                    <Users className="size-6" />
                    <p className="text-sm">{vazio}</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {pagina.linhas.map((l) => (
              <TableRow key={l.usuarioId}>
                <TableCell className="min-w-48">
                  <Link href={hrefFuncionario(l)} className="font-medium hover:underline">
                    {l.nome}
                  </Link>
                  {!l.ativo && (
                    <Badge variant="outline" className="text-muted-foreground ml-2">
                      Desligado
                    </Badge>
                  )}
                  <span className="text-muted-foreground block text-xs">
                    {[l.matricula && `mat. ${l.matricula}`, l.departamento].filter(Boolean).join(" · ") || "—"}
                  </span>
                </TableCell>
                {colunas.map((c) => (
                  <TableCell key={c.chave} className={c.className}>
                    {c.valor(l)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <Paginacao
        total={pagina.total}
        pagina={pagina.pagina}
        totalPaginas={pagina.totalPaginas}
        porPagina={porPagina}
        padrao={padrao}
      />
    </>
  )
}
