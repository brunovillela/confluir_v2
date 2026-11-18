import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Pencil } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { demandaDoProjeto, listarPessoasAtribuiveis, listarTarefas, listarTarefasAvulsas } from "@/lib/db/nucleo"
import { obterProjeto } from "@/lib/db/projetos"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { Dado, Linha } from "../../dados-resumo"
import { IncluirTarefas } from "../../tarefas/tarefa-forms"
import { TarefasLista } from "../../tarefas/tarefas-lista"
import { ProjetoAcoes } from "./projeto-acoes"

export const metadata: Metadata = { title: "Projeto — Confluir" }

export default async function ProjetoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  const sessao = await requirePermissao("ferramentas_projetos", [
    "ferramentas_projetos_edicao",
  ])
  const editor = podeAcessar(sessao.permissoes, "ferramentas_projetos_edicao")
  // Mexe nas tarefas do projeto quem edita o projeto ou cuida de Tarefas/Demandas.
  const editaTarefas = editor || podeAcessar(sessao.permissoes, "ferramentas_tarefas", ["ferramentas_demandas"])
  const veDemandas = podeAcessar(sessao.permissoes, "ferramentas_demandas", ["ferramentas_tarefas"])
  const { id } = await params
  const { salvo } = await searchParams

  const [projeto, tarefas, demanda, pessoas, avulsas] = await Promise.all([
    obterProjeto(id),
    listarTarefas({ paiTipo: "projeto", paiId: id }),
    demandaDoProjeto(id),
    editaTarefas ? listarPessoasAtribuiveis() : Promise.resolve([]),
    editaTarefas ? listarTarefasAvulsas() : Promise.resolve([]),
  ])
  if (!projeto) notFound()
  const concluidas = tarefas.tarefas.filter((t) => t.concluido).length
  const pendentes = tarefas.tarefas.length - concluidas

  const saldo =
    projeto.orcamento != null ? projeto.orcamento - projeto.gastoCompras : null

  const periodo =
    projeto.inicio || projeto.termino_previsao
      ? `${projeto.inicio ? formatarData(projeto.inicio) : "?"}${
          projeto.termino_previsao ? ` a ${formatarData(projeto.termino_previsao)}` : ""
        }`
      : "—"
  const usoOrcamento =
    projeto.orcamento != null && projeto.orcamento > 0
      ? (projeto.gastoCompras / projeto.orcamento) * 100
      : null

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link href="/painel/ferramentas/projetos">
          <ArrowLeft />
          Projetos
        </Link>
      </Button>

      {salvo && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Projeto salvo com sucesso.</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {projeto.titulo ?? "(sem título)"}
          </h1>
          {projeto.finalizado ? (
            <Badge variant="outline" className="text-muted-foreground">
              Finalizado
            </Badge>
          ) : (
            <Badge variant="outline" className="border-success/40 text-success-fg">
              Em andamento
            </Badge>
          )}
          {projeto.estrategico && <Badge variant="secondary">Estratégico</Badge>}
        </div>
        {editor && (
          <div className="flex flex-wrap items-start gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={`/painel/ferramentas/projetos/${id}/editar`}>
                <Pencil />
                Editar
              </Link>
            </Button>
            <ProjetoAcoes projetoId={id} finalizado={projeto.finalizado === true} pendentes={pendentes} />
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="grid gap-4">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <Dado rotulo="Tipo">{projeto.tipo ?? "—"}</Dado>
              <Dado rotulo="Período">{periodo}</Dado>
              <Dado rotulo="Centro de custo">{projeto.centroCustoNome ?? "—"}</Dado>
              <Dado rotulo="Departamentos">
                {projeto.departamentos.length > 0 ? projeto.departamentos.join(", ") : "—"}
              </Dado>
            </dl>
            {projeto.detalhamento && (
              <div className="border-t pt-4">
                <p className="text-muted-foreground mb-1 text-xs">Detalhamento</p>
                <p className="text-sm whitespace-pre-wrap">{projeto.detalhamento}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-3">
            <div>
              <p className="text-muted-foreground text-xs">Orçamento</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {projeto.orcamento != null ? formatarMoeda(projeto.orcamento) : "—"}
              </p>
            </div>
            {usoOrcamento != null && (
              <div className="grid gap-1">
                <Progress
                  value={Math.min(usoOrcamento, 100)}
                  className={`h-2 ${usoOrcamento > 100 ? "[&>[data-slot=progress-indicator]]:bg-destructive" : ""}`}
                  aria-label="Parte do orçamento já solicitada"
                />
                <p className="text-muted-foreground text-xs">
                  {usoOrcamento.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}% do orçamento solicitado
                </p>
              </div>
            )}
            <dl className="grid gap-1.5 border-t pt-3 text-sm">
              <Linha rotulo="Solicitado em Aquisição">{formatarMoeda(projeto.gastoCompras)}</Linha>
              <Linha rotulo="Saldo" alerta={saldo != null && saldo < 0}>
                {saldo != null ? formatarMoeda(saldo) : "—"}
              </Linha>
              <Linha rotulo="Solicitações">{projeto.solicitacoes.length.toLocaleString("pt-BR")}</Linha>
            </dl>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="grid gap-4">
          {(() => {
            const titulo = (
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="text-sm font-medium">
                  Tarefas{" "}
                  <span className="text-muted-foreground font-normal">
                    ({concluidas}/{tarefas.tarefas.length})
                  </span>
                </p>
                {demanda && veDemandas && (
                  <Link href={`/painel/ferramentas/demandas/${demanda.id}`} className="text-primary text-xs hover:underline">
                    Ver a demanda do projeto
                  </Link>
                )}
              </div>
            )
            return editaTarefas && !projeto.finalizado ? (
              <IncluirTarefas
                pessoas={pessoas}
                pai={{ campo: "projeto_id", id }}
                avulsas={avulsas}
                cabecalho={titulo}
                dica={
                  demanda
                    ? undefined
                    : "Na primeira tarefa, o projeto cria a demanda dele, e as tarefas seguem a rotina das demandas: o responsável é avisado e elas aparecem em Tarefas."
                }
              />
            ) : (
              titulo
            )
          })()}
          <TarefasLista
            tarefas={tarefas.tarefas}
            pai={{ campo: "projeto_id", id }}
            vazio="Nenhuma tarefa neste projeto ainda."
            desvincular={editaTarefas}
            pessoas={editaTarefas ? pessoas : undefined}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <p className="mb-3 text-sm font-medium">Solicitações de compra vinculadas</p>
          {projeto.solicitacoes.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhuma solicitação de compra vinculada a este projeto.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Objeto</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projeto.solicitacoes.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap">
                      <Link
                        href={`/painel/compras/${s.id}`}
                        className="text-primary font-medium hover:underline"
                      >
                        {s.codigo ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-80">
                      <span className="line-clamp-1">{s.descricao ?? "—"}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {s.situacao ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {s.valor != null ? formatarMoeda(s.valor) : "—"}
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
