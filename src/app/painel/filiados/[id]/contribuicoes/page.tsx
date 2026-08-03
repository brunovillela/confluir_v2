import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarContribuicoesFiliado } from "@/lib/db/filiados"
import { formatarMoeda } from "@/lib/formato"

export const metadata: Metadata = { title: "Contribuições — Confluir" }

const POR_PAGINA = 100

export default async function ContribuicoesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ pagina?: string }>
}) {
  await requirePermissao("filiacao_filiados", [
    "filiacao_gestao",
    "filiacao_receitas",
  ])

  const { id } = await params
  const sp = await searchParams
  const dados = await listarContribuicoesFiliado(id)
  if (!dados) notFound()
  const { filiado, contribuicoes, totalValor } = dados

  const pagina = Math.max(1, Number(sp.pagina) || 1)
  const totalPaginas = Math.max(1, Math.ceil(contribuicoes.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const daPagina = contribuicoes.slice(
    (paginaAtual - 1) * POR_PAGINA,
    paginaAtual * POR_PAGINA
  )

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/painel/filiados/${id}`}>
            <ArrowLeft />
            {filiado.nome_completo ?? "Filiado"}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Contribuições
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {contribuicoes.length.toLocaleString("pt-BR")} lançamento
          {contribuicoes.length === 1 ? "" : "s"} de{" "}
          {filiado.nome_completo ?? "—"} · total{" "}
          {formatarMoeda(totalValor)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Histórico por competência
          </CardTitle>
          <CardDescription>
            Da competência mais recente para a mais antiga
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {daPagina.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhuma contribuição registrada.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Competência</TableHead>
                  <TableHead className="hidden sm:table-cell">Fonte</TableHead>
                  <TableHead className="hidden md:table-cell">Tipo</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {daPagina.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium whitespace-nowrap tabular-nums">
                      {c.competencia ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden max-w-48 truncate sm:table-cell">
                      {c.fonte ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden md:table-cell">
                      {c.tipo ?? "—"}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatarMoeda(c.valor)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {totalPaginas > 1 && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-muted-foreground text-sm">
                Página {paginaAtual} de {totalPaginas}
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" asChild disabled={paginaAtual <= 1}>
                  {paginaAtual > 1 ? (
                    <Link
                      href={`/painel/filiados/${id}/contribuicoes?pagina=${paginaAtual - 1}`}
                    >
                      Anterior
                    </Link>
                  ) : (
                    <span>Anterior</span>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  disabled={paginaAtual >= totalPaginas}
                >
                  {paginaAtual < totalPaginas ? (
                    <Link
                      href={`/painel/filiados/${id}/contribuicoes?pagina=${paginaAtual + 1}`}
                    >
                      Próxima
                    </Link>
                  ) : (
                    <span>Próxima</span>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
