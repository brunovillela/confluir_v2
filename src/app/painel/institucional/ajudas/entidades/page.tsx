import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Building2, Plus } from "lucide-react"

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
import { listarEntidadesApoiadas } from "@/lib/db/fornecedores"
import { formatarCnpjCpf } from "@/lib/mascaras"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = {
  title: "Entidades apoiadas — Confluir",
}

const INPUT_FILTRO =
  "border-input bg-background text-foreground h-9 w-64 max-w-full rounded-md border px-3 text-sm shadow-xs outline-none"

export default async function EntidadesApoiadasPage({
  searchParams,
}: {
  searchParams: Promise<{
    busca?: string
    pagina?: string
    porPagina?: string
    excluido?: string
  }>
}) {
  const sessao = await requirePermissao("apoio_institucional", [
    "apoio_institucional_edicao",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "apoio_institucional_edicao")

  const brutos = await searchParams
  const busca = (brutos.busca ?? "").trim()

  const entidades = await listarEntidadesApoiadas(busca)
  const paginacao = lerPaginacao(brutos, 30)
  const { linhas, pagina, totalPaginas, total } = paginar(entidades, paginacao)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional/ajudas">
            <ArrowLeft />
            Ajudas institucionais
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Entidades apoiadas
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Organizações que podem receber ajuda institucional da entidade
            </p>
          </div>
          {podeEditar && (
            <Button asChild>
              <Link href="/painel/institucional/ajudas/entidades/novo">
                <Plus />
                Nova entidade
              </Link>
            </Button>
          )}
        </div>
      </div>

      <form
        action="/painel/institucional/ajudas/entidades"
        className="flex gap-2"
      >
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
              <Building2 className="mx-auto mb-2 size-5" />
              Nenhuma entidade apoiada cadastrada.
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
                {linhas.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-medium">
                      <Link
                        href={`/painel/institucional/ajudas/entidades/${e.id}`}
                        className="text-primary hover:underline"
                      >
                        {e.nome}
                      </Link>
                    </TableCell>
                    <TableCell>{e.nome_razao ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {e.cnpj_cpf ? formatarCnpjCpf(e.cnpj_cpf) : "—"}
                    </TableCell>
                    <TableCell>
                      {e.pessoa_juridica ? "Pessoa jurídica" : "Pessoa física"}
                    </TableCell>
                    <TableCell>
                      {e.bloqueado ? (
                        <Badge variant="warning">Bloqueada</Badge>
                      ) : (
                        <Badge variant="success">Ativa</Badge>
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
