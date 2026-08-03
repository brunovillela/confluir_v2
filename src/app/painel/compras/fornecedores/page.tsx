import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Plus, Truck } from "lucide-react"

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
import { Paginacao } from "@/components/paginacao"
import { requirePermissao } from "@/lib/auth"
import { listarFornecedores } from "@/lib/db/compras"
import { formatarCnpjCpf } from "@/lib/mascaras"
import { lerPaginacao, paginar } from "@/lib/paginacao"

export const metadata: Metadata = { title: "Fornecedores — Confluir" }

const INPUT_FILTRO =
  "border-input bg-background text-foreground h-9 w-64 max-w-full rounded-md border px-3 text-sm shadow-xs outline-none"

export default async function FornecedoresPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; pagina?: string; porPagina?: string }>
}) {
  await requirePermissao("aquisicoes_fornecedores", [
    "aquisicoes_compras_edicao",
  ])
  const brutos = await searchParams
  const busca = (brutos.busca ?? "").trim()

  const fornecedores = await listarFornecedores(busca)
  const paginacao = lerPaginacao(brutos, 30)
  const { linhas, pagina, totalPaginas, total } = paginar(
    fornecedores,
    paginacao
  )

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras">
            <ArrowLeft />
            Compras
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Fornecedores
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Empresas e pessoas cadastradas como fornecedores no sistema
            </p>
          </div>
          <Button asChild>
            <Link href="/painel/compras/fornecedores/novo">
              <Plus />
              Novo fornecedor
            </Link>
          </Button>
        </div>
      </div>

      <form action="/painel/compras/fornecedores" className="flex gap-2">
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Nome, razão social ou CNPJ/CPF"
          className={INPUT_FILTRO}
        />
        <Button type="submit" variant="outline" size="sm">
          Buscar
        </Button>
      </form>

      <Card>
        <CardContent>
          {linhas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <Truck className="mx-auto mb-2 size-5" />
              Nenhum fornecedor encontrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Razão social</TableHead>
                  <TableHead>CNPJ/CPF</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/painel/compras/fornecedores/${f.id}`}
                        className="text-primary hover:underline"
                      >
                        {f.nome}
                      </Link>
                    </TableCell>
                    <TableCell>{f.nome_razao ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {f.cnpj_cpf ? formatarCnpjCpf(f.cnpj_cpf) : "—"}
                    </TableCell>
                    <TableCell>
                      {f.pessoa_juridica ? "Pessoa jurídica" : "Pessoa física"}
                    </TableCell>
                    <TableCell>
                      {f.bloqueado ? (
                        <Badge variant="warning">Bloqueado</Badge>
                      ) : (
                        <Badge variant="success">Ativo</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="mt-4">
            <Paginacao
              total={total}
              pagina={pagina}
              totalPaginas={totalPaginas}
              porPagina={paginacao.porPagina}
              padrao={30}
            />
          </div>
        </CardContent>
      </Card>
    </>
  )
}
