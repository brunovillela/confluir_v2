import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CalendarRange } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import { Paginacao } from "@/components/paginacao"
import { requirePermissao } from "@/lib/auth"
import { listarCargos, listarNivelSalarialBase } from "@/lib/db/carreira"
import { listarTabelasSalariais } from "@/lib/db/tabelas-salariais"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { rotuloTabelaSalarial } from "@/lib/tabela-salarial"

import { ExcluirNivelBaseBotao, NivelBaseForm } from "./tabela-form"

export const metadata: Metadata = { title: "Tabela salarial — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-64 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/** NUMERIC → texto editável em pt-BR: 3000.12 → '3.000,12'. */
function salarioTexto(v: number | null): string {
  if (v === null) return ""
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export default async function TabelaSalarialPage({
  searchParams,
}: {
  searchParams: Promise<{
    salvo?: string
    reajustado?: string
    editar?: string
    cargo?: string
    tabela?: string
    pagina?: string
    porPagina?: string
  }>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_niveis_salariais"])

  const brutos = await searchParams
  const { salvo, reajustado, editar } = brutos
  const [tabelas, cargos] = await Promise.all([
    listarTabelasSalariais(),
    listarCargos(),
  ])
  // Sem escolha, a vigente; as outras ficam guardadas para consulta e preparo.
  const tabela =
    tabelas.find((t) => t.id === brutos.tabela) ??
    tabelas.find((t) => t.vigente) ??
    tabelas[0] ??
    null
  const base = tabela ? await listarNivelSalarialBase({ tabelaId: tabela.id }) : []

  const cargoFiltro = cargos.some((c) => c.id === brutos.cargo)
    ? brutos.cargo!
    : "todos"
  const filtrados =
    cargoFiltro === "todos"
      ? base
      : base.filter((b) => b.cargo_id === cargoFiltro)

  const paginacao = lerPaginacao(brutos, 30)
  const paginaAtual = paginar(filtrados, paginacao)

  const emEdicao = editar ? (base.find((b) => b.id === editar) ?? null) : null

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/niveis">
            <ArrowLeft />
            Níveis salariais
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                Tabela salarial{tabela ? ` ${rotuloTabelaSalarial(tabela)}` : ""}
              </h1>
              {tabela?.vigente && (
                <Badge variant="outline" className="border-success/40 text-success-fg">
                  Vigente
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {tabela?.data_inicio &&
                `${formatarData(tabela.data_inicio)} a ${formatarData(tabela.data_fim)} · `}
              {base.length} degrau{base.length === 1 ? "" : "s"} do acordo coletivo
              — salário básico por cargo, nível e carreira
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/painel/pessoal/niveis/tabelas">
              <CalendarRange />
              Tabelas e vigências
            </Link>
          </Button>
        </div>
      </div>

      {!tabela && (
        <Alert variant="warning">
          <AlertDescription>
            Nenhuma tabela salarial cadastrada. Registre a primeira em{" "}
            <Link href="/painel/pessoal/niveis/tabelas/nova" className="underline underline-offset-4">
              Nova tabela
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}
      {tabela && !tabela.vigente && (
        <Alert variant="warning">
          <AlertDescription>
            Esta tabela não é a vigente: mudar os degraus dela não altera o salário de ninguém.
          </AlertDescription>
        </Alert>
      )}

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Degrau salvo.</AlertDescription>
        </Alert>
      )}
      {reajustado && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Reajuste de {reajustado}% aplicado à tabela vigente.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-5">
        <div className="grid gap-4 lg:col-span-3">
          <form method="GET" className="flex flex-wrap items-center gap-2">
            <select
              name="tabela"
              defaultValue={tabela?.id}
              aria-label="Tabela salarial"
              className={SELECT_FILTRO}
            >
              {tabelas.map((t) => (
                <option key={t.id} value={t.id}>
                  {rotuloTabelaSalarial(t)}
                  {t.vigente ? " (vigente)" : ""}
                </option>
              ))}
            </select>
            <select
              name="cargo"
              defaultValue={cargoFiltro}
              aria-label="Filtrar por cargo"
              className={SELECT_FILTRO}
            >
              <option value="todos">Todos os cargos</option>
              {cargos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome ?? "(sem nome)"}
                </option>
              ))}
            </select>
            <Button type="submit" variant="secondary" size="sm">
              Filtrar
            </Button>
          </form>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Degraus</CardTitle>
              <CardDescription>
                Degraus usados em lançamentos não podem ser excluídos.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Nível</TableHead>
                      <TableHead className="hidden sm:table-cell">
                        Carreira
                      </TableHead>
                      <TableHead className="hidden md:table-cell">
                        Cargo
                      </TableHead>
                      <TableHead className="text-right">
                        Salário básico
                      </TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginaAtual.total === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-muted-foreground h-20 text-center text-sm"
                        >
                          Nenhum degrau cadastrado.
                        </TableCell>
                      </TableRow>
                    )}
                    {paginaAtual.linhas.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {[b.nivel_vertical, b.nivel_horizontal]
                            .filter(Boolean)
                            .join("-") || "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden sm:table-cell">
                          {b.nivel_carreira ?? "—"}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden max-w-48 truncate md:table-cell">
                          {b.cargoNome ?? "—"}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {formatarMoeda(b.salario_base)}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                              className="h-7 px-2"
                            >
                              <Link
                                href={`/painel/pessoal/niveis/tabela?tabela=${tabela?.id}&editar=${b.id}${cargoFiltro !== "todos" ? `&cargo=${cargoFiltro}` : ""}`}
                              >
                                Editar
                              </Link>
                            </Button>
                            <ExcluirNivelBaseBotao id={b.id} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Paginacao
                total={paginaAtual.total}
                pagina={paginaAtual.pagina}
                totalPaginas={paginaAtual.totalPaginas}
                porPagina={paginacao.porPagina}
                padrao={30}
              />
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          {/* key força remontagem ao alternar criar/editar (defaultValue). */}
          {tabela && (
          <NivelBaseForm
            key={emEdicao?.id ?? "novo"}
            tabelaId={tabela.id}
            cargos={cargos.map((c) => ({
              id: c.id,
              nome: c.nome ?? "(sem nome)",
            }))}
            degrau={
              emEdicao
                ? {
                    id: emEdicao.id,
                    cargo_id: emEdicao.cargo_id,
                    ordem: emEdicao.ordem,
                    nivel_vertical: emEdicao.nivel_vertical,
                    nivel_horizontal: emEdicao.nivel_horizontal,
                    nivel_carreira: emEdicao.nivel_carreira,
                    salarioTexto: salarioTexto(emEdicao.salario_base),
                  }
                : undefined
            }
          />
          )}
        </div>
      </div>
    </>
  )
}
