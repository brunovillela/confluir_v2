import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Plus, Search, Tags } from "lucide-react"

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
import { listarCentrosCusto } from "@/lib/db/financeiro"
import { lerPaginacao, paginar } from "@/lib/paginacao"

export const metadata: Metadata = { title: "Centros de custo — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export default async function CentrosCustoPage({
  searchParams,
}: {
  searchParams: Promise<{
    busca?: string
    tipo?: string
    situacao?: string
    excluido?: string
    pagina?: string
    porPagina?: string
  }>
}) {
  await requirePermissao("financeiro_pagamento", ["financeiro_caixa"])

  const sp = await searchParams
  const todas = await listarCentrosCusto()

  const tipos = [
    ...new Set(
      todas.map((c) => c.tipo_da_conta).filter((v): v is string => Boolean(v))
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"))

  const busca = (sp.busca ?? "").trim().toLowerCase()
  const tipo = tipos.includes(sp.tipo ?? "") ? sp.tipo! : ""
  const situacao = ["usaveis", "nao_usaveis"].includes(sp.situacao ?? "")
    ? sp.situacao!
    : "todas"

  const contas = todas.filter((c) => {
    if (tipo && c.tipo_da_conta !== tipo) return false
    if (situacao === "usaveis" && c.usavel !== true) return false
    if (situacao === "nao_usaveis" && c.usavel === true) return false
    if (!busca) return true
    return (
      (c.nome_da_conta ?? "").toLowerCase().includes(busca) ||
      (c.acesso ?? "").toLowerCase().includes(busca) ||
      (c.classificador ?? "").toLowerCase().includes(busca)
    )
  })

  // Página dedicada à lista: 30 por página.
  const paginacao = lerPaginacao(sp, 30)
  const paginaAtual = paginar(contas, paginacao)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/financeiro">
            <ArrowLeft />
            Financeiro
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                Centros de custo
              </h1>
              <Tags className="text-muted-foreground size-5" />
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {contas.length.toLocaleString("pt-BR")} de{" "}
              {todas.length.toLocaleString("pt-BR")} conta
              {todas.length === 1 ? "" : "s"} do plano de centros de custo
            </p>
          </div>
          <Button asChild>
            <Link href="/painel/financeiro/centros-custo/nova">
              <Plus />
              Nova conta
            </Link>
          </Button>
        </div>
      </div>

      {sp.excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Centro de custo excluído.</AlertDescription>
        </Alert>
      )}

      <form method="GET" className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            name="busca"
            defaultValue={sp.busca ?? ""}
            placeholder="Nome, código ou classificador"
            className="pl-8"
            aria-label="Buscar centro de custo"
          />
        </div>
        <select
          name="tipo"
          defaultValue={tipo}
          aria-label="Filtrar por tipo"
          className={SELECT_FILTRO}
        >
          <option value="">Todos os tipos</option>
          {tipos.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          name="situacao"
          defaultValue={situacao}
          aria-label="Filtrar por situação"
          className={SELECT_FILTRO}
        >
          <option value="todas">Todas</option>
          <option value="usaveis">Usáveis</option>
          <option value="nao_usaveis">Não usáveis</option>
        </select>
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Conta</TableHead>
              <TableHead className="hidden md:table-cell">Código</TableHead>
              <TableHead className="hidden lg:table-cell">
                Classificador
              </TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginaAtual.total === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-32">
                  <p className="text-muted-foreground text-center text-sm">
                    Nenhuma conta encontrada.
                  </p>
                </TableCell>
              </TableRow>
            )}
            {paginaAtual.linhas.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="max-w-72 font-medium">
                  <Link
                    href={`/painel/financeiro/centros-custo/${c.id}`}
                    className="hover:underline"
                  >
                    <span className="block truncate">
                      {c.nome_da_conta ?? "(sem nome)"}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground hidden font-mono text-xs md:table-cell">
                  {c.acesso ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground hidden font-mono text-xs lg:table-cell">
                  {c.classificador ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {c.tipo_da_conta ?? "—"}
                </TableCell>
                <TableCell>
                  {c.usavel === true ? (
                    <Badge
                      variant="outline"
                      className="border-success/40 text-success-fg"
                    >
                      Usável
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">
                      Não usável
                    </Badge>
                  )}
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
    </>
  )
}
