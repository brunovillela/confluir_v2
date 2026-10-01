import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Plus, TreePalm, UserRound } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
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
import { requirePermissao } from "@/lib/auth"
import { listarPeriodosFerias, resumoPeriodo } from "@/lib/db/ferias"
import { listarFuncionarios } from "@/lib/db/pessoal"
import { situacaoDoFuncionario } from "@/lib/ferias-painel"
import { formatarData } from "@/lib/formato"

import { BadgeSituacao, DetalheSituacao } from "../../situacao-ferias"
import { ExcluirPeriodoBotao } from "../../excluir-periodo"

export const metadata: Metadata = { title: "Férias do funcionário — Confluir" }

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
}

function Tile({ rotulo, valor, detalhe }: { rotulo: string; valor: React.ReactNode; detalhe?: React.ReactNode }) {
  return (
    <div className="bg-card rounded-xl border p-4 shadow-xs">
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{valor}</p>
      {detalhe && <p className="text-muted-foreground text-xs">{detalhe}</p>}
    </div>
  )
}

/**
 * Férias de UM funcionário: situação atual, histórico de todos os períodos
 * (com os gozos) e o atalho para abrir o próximo período já preenchido.
 */
export default async function FeriasDoFuncionarioPage({
  params,
  searchParams,
}: {
  params: Promise<{ usuarioId: string }>
  searchParams: Promise<{ excluido?: string }>
}) {
  await requirePermissao("pessoal_gestao")

  const { usuarioId } = await params
  const { excluido } = await searchParams
  const [{ linhas }, todos] = await Promise.all([
    listarFuncionarios({ situacao: "todos" }),
    listarPeriodosFerias(),
  ])
  const funcionario = linhas.find((f) => f.usuarioId === usuarioId)
  const periodos = todos.filter((p) => p.trabalhador_id === usuarioId)
  if (!funcionario && periodos.length === 0) notFound()

  const nome = funcionario?.nome ?? periodos[0]?.funcionarioNome ?? "(sem nome)"
  const desligado = Boolean(funcionario?.contrato_demissao)
  const hoje = hojeSP()
  const situacao = situacaoDoFuncionario(periodos, hoje, funcionario?.contrato_admissao ?? null)
  const novoHref = `/painel/pessoal/ferias/novo?funcionario=${usuarioId}${
    situacao.proximoAquisitivo ? `&inicio=${situacao.proximoAquisitivo}` : ""
  }`
  const gozados = periodos.reduce((s, p) => s + resumoPeriodo(p).gozados, 0)

  return (
    <>
      <RotuloTrilha valores={{ funcionario: "Funcionário", [usuarioId]: nome }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/ferias">
            <ArrowLeft />
            Férias
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{nome}</h1>
              <BadgeSituacao chave={situacao.chave} />
              {desligado && (
                <Badge variant="outline" className="text-muted-foreground">
                  Desligado
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {funcionario?.cargo ? `${funcionario.cargo} · ` : ""}
              Admissão {formatarData(funcionario?.contrato_admissao ?? null)}
              {situacao.detalhe && (
                <>
                  {" · "}
                  <DetalheSituacao situacao={situacao} />
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={`/painel/pessoal/${usuarioId}`}>
                <UserRound />
                Ficha
              </Link>
            </Button>
            {!desligado && (
              <Button asChild>
                <Link href={novoHref}>
                  <Plus />
                  Novo período
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Período excluído.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          rotulo="Saldo a gozar"
          valor={situacao.saldo}
          detalhe={`${situacao.periodosAbertos} período${situacao.periodosAbertos === 1 ? "" : "s"} em aberto`}
        />
        <Tile
          rotulo="Próximo prazo"
          valor={situacao.prazo ? formatarData(situacao.prazo) : "—"}
          detalhe="fim do concessivo com saldo"
        />
        <Tile
          rotulo="Próximas férias"
          valor={situacao.proximoGozo ? formatarData(situacao.proximoGozo.inicio) : "—"}
          detalhe={
            situacao.proximoGozo
              ? situacao.proximoGozo.autorizado
                ? `até ${formatarData(situacao.proximoGozo.termino)}`
                : "aguardando autorização"
              : "nada marcado"
          }
        />
        <Tile rotulo="Dias já gozados" valor={gozados} detalhe="em todos os períodos" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico de férias</CardTitle>
          <CardDescription>
            {periodos.length} período{periodos.length === 1 ? "" : "s"} — o dia de início conta
            como o primeiro dia de férias. Períodos sem gozo podem ser excluídos.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {periodos.length === 0 && (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center text-sm">
              <TreePalm className="size-6" />
              Nenhum período cadastrado.
              {!desligado && (
                <Button size="sm" asChild className="mt-1">
                  <Link href={novoHref}>
                    <Plus />
                    Criar o primeiro período
                  </Link>
                </Button>
              )}
            </div>
          )}
          {periodos.map((p) => {
            const r = resumoPeriodo(p)
            return (
              <div key={p.id} className="overflow-hidden rounded-lg border">
                <div className="bg-muted/40 flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      Aquisitivo {formatarData(p.aquisitivo_inicio)} – {formatarData(p.aquisitivo_termino)}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Concessivo até {formatarData(p.concessivo_termino)} · direito {r.direito}
                      {r.abono > 0 ? ` · ${r.abono} vendidos` : ""} · gozados {r.gozados} ·{" "}
                      <span className="text-foreground font-medium">saldo {r.saldo}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {p.finalizado === true ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        Finalizado
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-success/40 text-success-fg">
                        Em aberto
                      </Badge>
                    )}
                    <Button variant="ghost" size="sm" asChild className="h-7 px-2">
                      <Link href={`/painel/pessoal/ferias/${p.id}`}>Abrir</Link>
                    </Button>
                    {p.gozos.length === 0 && (
                      <ExcluirPeriodoBotao
                        periodoId={p.id}
                        voltarPara={`/painel/pessoal/ferias/funcionario/${usuarioId}`}
                        compacto
                      />
                    )}
                  </div>
                </div>
                {p.gozos.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Início</TableHead>
                        <TableHead>Último dia</TableHead>
                        <TableHead className="text-right">Dias</TableHead>
                        <TableHead>Situação</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {p.gozos.map((g) => (
                        <TableRow key={g.id}>
                          <TableCell className="whitespace-nowrap">{formatarData(g.inicio)}</TableCell>
                          <TableCell className="text-muted-foreground whitespace-nowrap">
                            {formatarData(g.termino)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{g.dias ?? "—"}</TableCell>
                          <TableCell>
                            {g.autorizado === true ? (
                              <Badge variant="outline" className="border-success/40 text-success-fg">
                                Autorizado
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="border-warning/40 text-warning-fg">
                                Aguardando autorização
                              </Badge>
                            )}
                            {g.abono_solicitado === true && (
                              <Badge variant="outline" className="border-info/40 text-info-fg ml-1">
                                Venda de 1/3
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-muted-foreground px-4 py-3 text-xs">Nenhum gozo neste período.</p>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </>
  )
}
