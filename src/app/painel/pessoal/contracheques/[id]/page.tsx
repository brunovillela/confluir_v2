import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink, Pencil } from "lucide-react"

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
import {
  buscarRemessaContracheques,
  contrachequesDaRemessa,
  funcionariosParaSelecao,
  naturezaRemessaContracheques,
  urlArquivoPessoal,
} from "@/lib/db/pessoal"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"

import { RemessaContrachequesForm } from "../remessa-form"
import { AcoesContracheque, NovoContrachequeForm } from "./contracheque-itens"

export const metadata: Metadata = { title: "Remessa de contracheques — Confluir" }

export default async function RemessaContrachequesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    salvo?: string
    editar?: string
    pagina?: string
    porPagina?: string
  }>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_contracheque"])

  const { id } = await params
  const paramsBusca = await searchParams
  const { salvo, editar } = paramsBusca
  const [remessa, itens, funcionarios] = await Promise.all([
    buscarRemessaContracheques(id),
    contrachequesDaRemessa(id),
    funcionariosParaSelecao(),
  ])
  if (!remessa) notFound()

  // Página concorrida (cabeçalho + formulário): 10 itens por página.
  const paginacao = lerPaginacao(paramsBusca, 10)
  const paginaAtual = paginar(itens, paginacao)

  const urls = new Map<string, string | null>()
  for (const i of paginaAtual.linhas) {
    urls.set(i.id, await urlArquivoPessoal(i.arquivo))
  }

  // Funcionários ainda sem contracheque nesta remessa.
  const jaTem = new Set(itens.map((i) => i.funcionario_id))
  const disponiveis = funcionarios.filter((f) => !jaTem.has(f.usuarioId))

  // Remessa finalizada: sem inclusão, edição ou exclusão de contracheques.
  const bloqueada = remessa.finalizada === true

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/contracheques">
            <ArrowLeft />
            Remessas de contracheques
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {remessa.nome_remessa ?? "(sem nome)"}
              </h1>
              <Badge variant="outline" className="text-muted-foreground">
                {naturezaRemessaContracheques(remessa)}
              </Badge>
              {remessa.finalizada === true ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Finalizada
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-success/40 text-success-fg"
                >
                  Aberta
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {itens.length} contracheque{itens.length === 1 ? "" : "s"} · criada
              em {formatarData(remessa.created_at)}
            </p>
          </div>
          {editar !== "1" && (
            <Button variant="outline" asChild>
              <Link href={`/painel/pessoal/contracheques/${id}?editar=1`}>
                <Pencil />
                Editar remessa
              </Link>
            </Button>
          )}
        </div>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Remessa salva com sucesso.</AlertDescription>
        </Alert>
      )}

      {editar === "1" ? (
        <RemessaContrachequesForm remessa={remessa} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contracheques da remessa</CardTitle>
              <CardDescription>
                Contracheques liberados ficam visíveis ao funcionário.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Funcionário</TableHead>
                      <TableHead>Arquivo</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginaAtual.total === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={4}
                          className="text-muted-foreground h-20 text-center text-sm"
                        >
                          Nenhum contracheque nesta remessa.
                        </TableCell>
                      </TableRow>
                    )}
                    {paginaAtual.linhas.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="max-w-64 truncate font-medium">
                          {i.funcionario_id ? (
                            <Link
                              href={`/painel/pessoal/${i.funcionario_id}`}
                              className="hover:underline"
                            >
                              {i.funcionarioNome ?? "(sem nome)"}
                            </Link>
                          ) : (
                            (i.funcionarioNome ?? "(sem funcionário)")
                          )}
                        </TableCell>
                        <TableCell>
                          {urls.get(i.id) ? (
                            <a
                              href={urls.get(i.id)!}
                              target="_blank"
                              rel="noreferrer"
                              className="text-foreground inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
                            >
                              Abrir <ExternalLink className="size-3" />
                            </a>
                          ) : (
                            <span className="text-muted-foreground text-xs">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {i.liberado === true ? (
                            <Badge
                              variant="outline"
                              className="border-success/40 text-success-fg"
                            >
                              Liberado
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-muted-foreground">
                              Bloqueado
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {bloqueada ? (
                            <span className="text-muted-foreground block text-right text-xs">
                              —
                            </span>
                          ) : (
                            <AcoesContracheque
                              id={i.id}
                              remessaId={id}
                              liberado={i.liberado === true}
                            />
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
                padrao={10}
              />

              {bloqueada ? (
                <Alert>
                  <AlertDescription>
                    Remessa finalizada — inclusão, edição e exclusão de
                    contracheques estão bloqueadas. Para mexer nos itens, reabra
                    a remessa em “Editar remessa”.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="border-t pt-4">
                  <p className="mb-2 text-sm font-medium">
                    Adicionar contracheque
                  </p>
                  <NovoContrachequeForm remessaId={id} funcionarios={disponiveis} />
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}
