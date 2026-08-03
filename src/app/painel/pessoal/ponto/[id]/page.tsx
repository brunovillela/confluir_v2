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
  buscarRemessaPonto,
  funcionariosParaSelecao,
  registrosDaRemessaPonto,
  urlArquivoPessoal,
} from "@/lib/db/pessoal"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"

import { RemessaPontoForm } from "../remessa-form"
import { ExcluirRegistroBotao, RegistroPontoForm } from "./registro-itens"

export const metadata: Metadata = {
  title: "Remessa de controle de ponto — Confluir",
}

function horas(v: number | null): string {
  return v === null
    ? "—"
    : v.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
}

export default async function RemessaPontoPage({
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
  await requirePermissao("pessoal_gestao")

  const { id } = await params
  const paramsBusca = await searchParams
  const { salvo, editar } = paramsBusca
  const [remessa, itens, funcionarios] = await Promise.all([
    buscarRemessaPonto(id),
    registrosDaRemessaPonto(id),
    funcionariosParaSelecao(),
  ])
  if (!remessa) notFound()

  // Página concorrida (cabeçalho + formulário): 10 registros por página.
  const paginacao = lerPaginacao(paramsBusca, 10)
  const paginaAtual = paginar(itens, paginacao)

  const urls = new Map<string, string | null>()
  for (const i of paginaAtual.linhas) {
    urls.set(i.id, await urlArquivoPessoal(i.arquivo))
  }

  const editandoRemessa = editar === "remessa"
  const registroEmEdicao = editar
    ? (itens.find((i) => i.id === editar) ?? null)
    : null

  const jaTem = new Set(itens.map((i) => i.funcionario_id))
  const disponiveis = funcionarios.filter((f) => !jaTem.has(f.usuarioId))

  // Remessa finalizada: sem inclusão, edição ou exclusão de registros.
  const bloqueada = remessa.finalizada === true

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/ponto">
            <ArrowLeft />
            Remessas de controle de ponto
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                {remessa.nome_remessa ?? "(sem nome)"}
              </h1>
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
              {itens.length} registro{itens.length === 1 ? "" : "s"} de ponto ·
              criada em {formatarData(remessa.created_at)}
            </p>
          </div>
          {!editandoRemessa && (
            <Button variant="outline" asChild>
              <Link href={`/painel/pessoal/ponto/${id}?editar=remessa`}>
                <Pencil />
                Editar remessa
              </Link>
            </Button>
          )}
        </div>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Salvo com sucesso.</AlertDescription>
        </Alert>
      )}

      {editandoRemessa ? (
        <RemessaPontoForm remessa={remessa} />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Registros de ponto</CardTitle>
              <CardDescription>
                Horas em 70% e 100% por funcionário; registros liberados ficam
                visíveis ao funcionário.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Funcionário</TableHead>
                      <TableHead className="text-right">Realiz. 70%</TableHead>
                      <TableHead className="text-right">Pagas 70%</TableHead>
                      <TableHead className="text-right">Saldo 70%</TableHead>
                      <TableHead className="text-right">Realiz. 100%</TableHead>
                      <TableHead className="text-right">Pagas 100%</TableHead>
                      <TableHead className="text-right">Saldo 100%</TableHead>
                      <TableHead>Espelho</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginaAtual.total === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={10}
                          className="text-muted-foreground h-20 text-center text-sm"
                        >
                          Nenhum registro nesta remessa.
                        </TableCell>
                      </TableRow>
                    )}
                    {paginaAtual.linhas.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="max-w-52 truncate font-medium">
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
                        <TableCell className="text-right tabular-nums">
                          {horas(i.horas_realizadas_70)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {horas(i.horas_pagas_70)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {horas(i.saldo_remanescente_70)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {horas(i.horas_realizadas_100)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {horas(i.horas_pagas_100)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {horas(i.saldo_remanescente_100)}
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
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                asChild
                                className="h-7 px-2"
                              >
                                <Link
                                  href={`/painel/pessoal/ponto/${id}?editar=${i.id}`}
                                >
                                  Editar
                                </Link>
                              </Button>
                              <ExcluirRegistroBotao id={i.id} remessaId={id} />
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="mt-4">
                <Paginacao
                  total={paginaAtual.total}
                  pagina={paginaAtual.pagina}
                  totalPaginas={paginaAtual.totalPaginas}
                  porPagina={paginacao.porPagina}
                  padrao={10}
                />
              </div>
            </CardContent>
          </Card>

          {bloqueada ? (
            <Alert>
              <AlertDescription>
                Remessa finalizada — inclusão, edição e exclusão de registros
                estão bloqueadas. Para mexer nos itens, reabra a remessa em
                “Editar remessa”.
              </AlertDescription>
            </Alert>
          ) : (
            <RegistroPontoForm
              remessaId={id}
              funcionarios={disponiveis}
              registro={registroEmEdicao ?? undefined}
            />
          )}
        </>
      )}
    </>
  )
}
