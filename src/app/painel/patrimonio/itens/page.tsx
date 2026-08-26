import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Download, Package, Plus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarItens, resumoPatrimonio } from "@/lib/db/patrimonio"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Itens patrimoniais — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Params = { busca?: string; situacao?: string }

export default async function ItensPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const sessao = await requirePermissao("patrimonio_geral", [
    "patrimonio_leitura",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "patrimonio_geral")

  const brutos = await searchParams
  const situacao =
    brutos.situacao === "inativos" || brutos.situacao === "todos"
      ? brutos.situacao
      : "ativos"
  const busca = (brutos.busca ?? "").trim()

  const [resumo, itens] = await Promise.all([
    resumoPatrimonio(),
    listarItens({ busca, situacao }),
  ])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/patrimonio">
            <ArrowLeft />
            Patrimônio
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Itens patrimoniais
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Bens do patrimônio: busca, situação e cautela
            </p>
          </div>
          {podeEditar && (
            <Button asChild>
              <Link href="/painel/patrimonio/novo">
                <Plus />
                Novo item
              </Link>
            </Button>
          )}
        </div>
      </div>

      {!resumo.disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            Patrimônio ainda não configurado — rode{" "}
            <code>supabase/patrimonio.sql</code> no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      )}

      <form
        className="flex flex-wrap items-center gap-2"
        action="/painel/patrimonio/itens"
      >
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Nome, nº de patrimônio ou descrição"
          className={`${SELECT_FILTRO} w-72 max-w-full`}
        />
        <select
          name="situacao"
          defaultValue={situacao}
          className={SELECT_FILTRO}
        >
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
          <option value="todos">Todos</option>
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
        <Button variant="outline" size="sm" asChild>
          <a
            href={`/painel/patrimonio/exportar?${new URLSearchParams({ busca, situacao }).toString()}`}
          >
            <Download />
            Exportar CSV
          </a>
        </Button>
      </form>

      <Card>
        <CardContent>
          {itens.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <Package className="mx-auto mb-2 size-5" />
              Nenhum item encontrado com estes filtros.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Nº patrimônio</TableHead>
                  <TableHead>Recinto</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Cautela</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="max-w-72">
                      <Link
                        href={`/painel/patrimonio/${i.id}`}
                        className="text-primary font-medium hover:underline"
                      >
                        <span className="line-clamp-1">
                          {i.nome ?? "(sem nome)"}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {i.numero_patrimonio ?? "—"}
                    </TableCell>
                    <TableCell>{i.recintoNome ?? "—"}</TableCell>
                    <TableCell>
                      {i.ativo ? (
                        <Badge variant="outline">Ativo</Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground"
                        >
                          Inativo
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {i.emCautela ? (
                        <Badge
                          variant="outline"
                          className="border-warning/40 text-warning-fg"
                        >
                          {i.responsavelNome ?? "Em cautela"}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}
