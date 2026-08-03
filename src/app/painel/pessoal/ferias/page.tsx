import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Plus, TreePalm } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Paginacao } from "@/components/paginacao"
import { requirePermissao } from "@/lib/auth"
import { listarPeriodosFerias, resumoPeriodo } from "@/lib/db/ferias"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"

export const metadata: Metadata = { title: "Férias — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type ParamsLista = {
  salvo?: string
  excluido?: string
  busca?: string
  situacao?: string
  pagina?: string
  porPagina?: string
}

export default async function FeriasPage({
  searchParams,
}: {
  searchParams: Promise<ParamsLista>
}) {
  await requirePermissao("pessoal_gestao")

  const brutos = await searchParams
  const { salvo, excluido } = brutos
  const periodos = await listarPeriodosFerias()

  const params = {
    busca: (brutos.busca ?? "").trim(),
    situacao: ["abertos", "finalizados"].includes(brutos.situacao ?? "")
      ? brutos.situacao!
      : "todos",
  }

  const filtrados = periodos.filter((p) => {
    if (
      params.busca &&
      !(p.funcionarioNome ?? "")
        .toLocaleLowerCase("pt-BR")
        .includes(params.busca.toLocaleLowerCase("pt-BR"))
    ) {
      return false
    }
    if (params.situacao === "abertos" && p.finalizado === true) return false
    if (params.situacao === "finalizados" && p.finalizado !== true) return false
    return true
  })

  const paginacao = lerPaginacao(brutos, 30)
  const paginaAtual = paginar(filtrados, paginacao)

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
            <h1 className="text-2xl font-semibold tracking-tight">Férias</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {filtrados.length} período{filtrados.length === 1 ? "" : "s"} —
              cada período pode ter até 3 gozos (um deles com no mínimo 14
              dias)
            </p>
          </div>
          <Button asChild>
            <Link href="/painel/pessoal/ferias/novo">
              <Plus />
              Novo período
            </Link>
          </Button>
        </div>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Período salvo.</AlertDescription>
        </Alert>
      )}
      {excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Período excluído.</AlertDescription>
        </Alert>
      )}

      <form method="GET" className="flex flex-wrap items-center gap-2">
        <Input
          name="busca"
          defaultValue={params.busca}
          placeholder="Nome do funcionário"
          className="h-9 w-full sm:max-w-56"
          aria-label="Buscar por funcionário"
        />
        <select
          name="situacao"
          defaultValue={params.situacao}
          aria-label="Filtrar por situação"
          className={SELECT_FILTRO}
        >
          <option value="todos">Todas as situações</option>
          <option value="abertos">Em aberto</option>
          <option value="finalizados">Finalizados</option>
        </select>
        <Button type="submit" variant="secondary" size="sm">
          Filtrar
        </Button>
      </form>

      <div className="overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Funcionário</TableHead>
                <TableHead>Aquisitivo</TableHead>
                <TableHead className="hidden md:table-cell">
                  Concessivo
                </TableHead>
                <TableHead className="text-right">Direito</TableHead>
                <TableHead className="text-right">Gozados</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="hidden lg:table-cell">Abono</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginaAtual.total === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="h-40">
                    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                      <TreePalm className="size-6" />
                      <p className="text-sm">
                        Nenhum período de férias
                        {params.busca && <> para “{params.busca}”</>}.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {paginaAtual.linhas.map((p) => {
                const r = resumoPeriodo(p)
                return (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-56 font-medium">
                      {p.trabalhador_id ? (
                        <Link
                          href={`/painel/pessoal/${p.trabalhador_id}`}
                          className="hover:underline"
                        >
                          <span className="block truncate">
                            {p.funcionarioNome ?? "(sem nome)"}
                          </span>
                        </Link>
                      ) : (
                        "(sem funcionário)"
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatarData(p.aquisitivo_inicio)} –{" "}
                      {formatarData(p.aquisitivo_termino)}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden whitespace-nowrap md:table-cell">
                      {formatarData(p.concessivo_inicio)} –{" "}
                      {formatarData(p.concessivo_termino)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.direito}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.gozados}
                      {p.gozos.length > 0 && (
                        <span className="text-muted-foreground ml-1 text-xs">
                          ({p.gozos.length}{" "}
                          {p.gozos.length === 1 ? "gozo" : "gozos"})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {r.saldo}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {p.abono_pecuniario === true ? (
                        <Badge
                          variant="outline"
                          className="border-info/40 text-info-fg"
                        >
                          1/3 vendido
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.finalizado === true ? (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground"
                        >
                          Finalizado
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-success/40 text-success-fg"
                        >
                          Em aberto
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="h-7 px-2"
                      >
                        <Link href={`/painel/pessoal/ferias/${p.id}`}>
                          Abrir
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <Paginacao
        total={paginaAtual.total}
        pagina={paginaAtual.pagina}
        totalPaginas={paginaAtual.totalPaginas}
        porPagina={paginacao.porPagina}
        padrao={30}
      />
    </>
  )
}
