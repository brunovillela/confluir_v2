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
  buscarRemessaInformes,
  informesDaRemessa,
} from "@/lib/db/informes"
import { funcionariosParaSelecao, urlArquivoPessoal } from "@/lib/db/pessoal"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"

import { RemessaInformesForm } from "../remessa-form"
import {
  AlternarLiberadoBotao,
  ExcluirInformeBotao,
  InformeForm,
} from "./informe-itens"

export const metadata: Metadata = {
  title: "Remessa de informes de rendimentos — Confluir",
}

export default async function RemessaInformesPage({
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
  await requirePermissao("pessoal_gestao", ["pessoal_informes_rendimentos"])

  const { id } = await params
  const paramsBusca = await searchParams
  const { salvo, editar } = paramsBusca
  const [remessa, itens, funcionarios] = await Promise.all([
    buscarRemessaInformes(id),
    informesDaRemessa(id),
    funcionariosParaSelecao(),
  ])
  if (!remessa) notFound()

  // Página concorrida (cabeçalho + formulário): 10 informes por página.
  const paginacao = lerPaginacao(paramsBusca, 10)
  const paginaAtual = paginar(itens, paginacao)

  const urls = new Map<string, string | null>()
  for (const i of paginaAtual.linhas) {
    urls.set(i.id, await urlArquivoPessoal(i.arquivo_url))
  }

  const editandoRemessa = editar === "remessa"
  const jaTem = new Set(itens.map((i) => i.funcionario_id))
  const disponiveis = funcionarios.filter((f) => !jaTem.has(f.usuarioId))

  // Remessa fechada: sem inclusão, liberação ou exclusão de informes.
  const bloqueada = remessa.fechada === true

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/informes">
            <ArrowLeft />
            Informes de rendimentos
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">
                Ano-base {remessa.ano_referencia_os ?? "(sem ano)"}
              </h1>
              {bloqueada ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Fechada
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
              {itens.length} informe{itens.length === 1 ? "" : "s"} · criada em{" "}
              {formatarData(remessa.created_at)}
            </p>
          </div>
          {!editandoRemessa && (
            <Button variant="outline" asChild>
              <Link href={`/painel/pessoal/informes/${id}?editar=remessa`}>
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
        <RemessaInformesForm
          remessa={{
            id: remessa.id,
            ano_referencia_os: remessa.ano_referencia_os,
            fechada: remessa.fechada,
            itens: remessa.itens,
          }}
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Informes da remessa</CardTitle>
              <CardDescription>
                Informes liberados ficam visíveis ao funcionário no
                autosserviço; liberar avisa por notificação e email.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="overflow-x-auto rounded-lg border">
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
                          Nenhum informe nesta remessa.
                        </TableCell>
                      </TableRow>
                    )}
                    {paginaAtual.linhas.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell className="max-w-56 truncate font-medium">
                          {i.funcionario_id ? (
                            <Link
                              href={`/painel/pessoal/${i.funcionario_id}`}
                              className="hover:underline"
                            >
                              {i.funcionarioNome ?? "(sem nome)"}
                            </Link>
                          ) : (
                            "(sem funcionário)"
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
                            <span className="text-muted-foreground text-xs">
                              —
                            </span>
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
                            <Badge
                              variant="outline"
                              className="text-muted-foreground"
                            >
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
                              <AlternarLiberadoBotao
                                id={i.id}
                                remessaId={id}
                                liberado={i.liberado === true}
                              />
                              <ExcluirInformeBotao id={i.id} remessaId={id} />
                            </div>
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
            </CardContent>
          </Card>

          {bloqueada ? (
            <Alert>
              <AlertDescription>
                Remessa fechada — inclusão, liberação e exclusão de informes
                estão bloqueadas. Para mexer nos itens, reabra a remessa em
                “Editar remessa”.
              </AlertDescription>
            </Alert>
          ) : (
            <InformeForm remessaId={id} funcionarios={disponiveis} />
          )}
        </>
      )}
    </>
  )
}
