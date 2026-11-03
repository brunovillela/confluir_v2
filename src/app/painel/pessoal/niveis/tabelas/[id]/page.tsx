import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Table2 } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { rotuloNivelSalarial } from "@/lib/db/carreira"
import { buscarTabelaSalarial, previaVigencia } from "@/lib/db/tabelas-salariais"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { rotuloTabelaSalarial } from "@/lib/tabela-salarial"

import { ExcluirTabelaBotao, TabelaVigenciaForm, TornarVigenteBotao } from "../tabela-vigencia-form"

export const metadata: Metadata = { title: "Tabela salarial — Confluir" }

export default async function TabelaSalarialDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string; vigente?: string; sem?: string }>
}) {
  const sessao = await requirePermissao("pessoal_gestao", ["pessoal_niveis_salariais"])
  // Tornar vigente muda o salário dos funcionários: só a gestão completa.
  const temGestao = podeAcessar(sessao.permissoes, "pessoal_gestao")
  const { id } = await params
  const { salvo, vigente, sem } = await searchParams
  const tabela = await buscarTabelaSalarial(id)
  if (!tabela) notFound()
  const nome = rotuloTabelaSalarial(tabela)
  const plano =
    temGestao && !tabela.vigente && tabela.data_inicio && tabela.degraus > 0 ? await previaVigencia(tabela) : null

  return (
    <>
      <RotuloTrilha valores={{ [id]: nome }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/niveis/tabelas">
            <ArrowLeft />
            Tabelas salariais
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{nome}</h1>
              {tabela.vigente ? (
                <Badge variant="outline" className="border-success/40 text-success-fg">
                  Vigente
                </Badge>
              ) : (
                <Badge variant="outline" className="text-muted-foreground">
                  Guardada
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {tabela.data_inicio ? `${formatarData(tabela.data_inicio)} a ${formatarData(tabela.data_fim)} · ` : ""}
              {tabela.degraus} degrau{tabela.degraus === 1 ? "" : "s"}
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/painel/pessoal/niveis/tabela?tabela=${id}`}>
              <Table2 />
              Ver degraus
            </Link>
          </Button>
        </div>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Tabela salva.</AlertDescription>
        </Alert>
      )}
      {vigente !== undefined && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Esta é a tabela vigente agora. {vigente} funcionário(s) mudaram de degrau.
            {Number(sem) > 0 && ` ${sem} sem degrau equivalente continuam na tabela anterior: troque nos lançamentos deles.`}
          </AlertDescription>
        </Alert>
      )}

      <TabelaVigenciaForm key={`${tabela.data_inicio}-${tabela.data_fim}`} tabela={tabela} />

      {plano && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tornar vigente</CardTitle>
            <CardDescription>
              Confira quem muda de degrau. Quem mudar passa a valer a partir de {formatarData(tabela.data_inicio)}, ou mantém a data
              do lançamento, se ele for mais recente. A tabela atual fica guardada.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {plano.semEquivalente.length > 0 && (
              <Alert variant="warning">
                <AlertDescription>
                  <span>
                    {plano.semEquivalente.length} funcionário(s) sem degrau equivalente nesta tabela continuam na tabela atual, até
                    trocar no lançamento:
                  </span>
                  <span className="mt-1 block text-xs">
                    {plano.semEquivalente.map((n) => n.funcionarioNome ?? "(sem nome)").join(", ")}
                  </span>
                </AlertDescription>
              </Alert>
            )}
            {plano.mudam.length > 0 ? (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Funcionário</TableHead>
                      <TableHead>Degrau</TableHead>
                      <TableHead className="text-right">Salário atual</TableHead>
                      <TableHead className="text-right">Salário novo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plano.mudam.map((m) => (
                      <TableRow key={m.lancamentoId}>
                        <TableCell className="font-medium">
                          {m.funcionarioNome ?? "(sem nome)"}
                          {m.proximoSemEquivalente && (
                            <span className="text-warning-fg block text-xs font-normal">
                              O próximo nível não existe nesta tabela: ficará sem degrau definido.
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">{rotuloNivelSalarial(m.para)}</TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">{formatarMoeda(m.atual?.salario_base)}</TableCell>
                        <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                          {formatarMoeda(m.para.salario_base)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Nenhum funcionário muda de degrau.</p>
            )}
            <TornarVigenteBotao id={id} nome={nome} mudam={plano.mudam.length} sem={plano.semEquivalente.length} />
          </CardContent>
        </Card>
      )}

      {!tabela.vigente && <ExcluirTabelaBotao id={id} />}
    </>
  )
}
