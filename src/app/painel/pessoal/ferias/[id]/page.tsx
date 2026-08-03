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
import { requirePermissao } from "@/lib/auth"
import { buscarPeriodoFerias, resumoPeriodo } from "@/lib/db/ferias"
import { funcionariosParaSelecao, urlArquivoPessoal } from "@/lib/db/pessoal"
import { formatarData } from "@/lib/formato"

import { PeriodoFeriasForm } from "../periodo-form"
import {
  AutorizarGozoBotao,
  ExcluirGozoBotao,
  GozoForm,
} from "./gozo-itens"

export const metadata: Metadata = { title: "Período de férias — Confluir" }

function Tile({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className="mt-0.5 text-xl font-semibold tabular-nums">{valor}</p>
    </div>
  )
}

export default async function PeriodoFeriasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string; editar?: string }>
}) {
  await requirePermissao("pessoal_gestao")

  const { id } = await params
  const { salvo, editar } = await searchParams
  const [periodo, funcionarios] = await Promise.all([
    buscarPeriodoFerias(id),
    funcionariosParaSelecao(),
  ])
  if (!periodo) notFound()

  const r = resumoPeriodo(periodo)
  const editandoPeriodo = editar === "periodo"
  const gozoEmEdicao =
    editar && editar !== "periodo"
      ? (periodo.gozos.find((g) => g.id === editar) ?? null)
      : null

  const urls = new Map<string, string | null>()
  for (const g of periodo.gozos) {
    urls.set(g.id, await urlArquivoPessoal(g.aviso_ferias_url))
  }

  const finalizado = periodo.finalizado === true

  return (
    <>
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
              <h1 className="text-2xl font-semibold tracking-tight">
                {periodo.funcionarioNome ?? "(sem nome)"}
              </h1>
              {finalizado ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Finalizado
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-success/40 text-success-fg"
                >
                  Em aberto
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Aquisitivo {formatarData(periodo.aquisitivo_inicio)} –{" "}
              {formatarData(periodo.aquisitivo_termino)} · concessivo{" "}
              {formatarData(periodo.concessivo_inicio)} –{" "}
              {formatarData(periodo.concessivo_termino)}
            </p>
          </div>
          {!editandoPeriodo && (
            <Button variant="outline" asChild>
              <Link href={`/painel/pessoal/ferias/${id}?editar=periodo`}>
                <Pencil />
                Editar período
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

      {editandoPeriodo ? (
        <PeriodoFeriasForm
          funcionarios={funcionarios}
          periodo={{
            id: periodo.id,
            trabalhador_id: periodo.trabalhador_id,
            funcionarioNome: periodo.funcionarioNome,
            aquisitivo_inicio: periodo.aquisitivo_inicio,
            aquisitivo_termino: periodo.aquisitivo_termino,
            concessivo_inicio: periodo.concessivo_inicio,
            concessivo_termino: periodo.concessivo_termino,
            dias_disponiveis: periodo.dias_disponiveis,
            abono_pecuniario: periodo.abono_pecuniario,
            finalizado: periodo.finalizado,
            gozos: periodo.gozos.length,
          }}
        />
      ) : (
        <>
          {r.saldo < 0 && (
            <Alert className="border-warning/40 text-warning-fg">
              <AlertDescription>
                Saldo negativo: no dado migrado do Bubble, “dias de direito”
                guardava o SALDO restante (aqui há {r.gozados} dias gozados
                contra {r.direito} de direito). Corrija os dias de direito em
                “Editar período” (ex.: 30).
              </AlertDescription>
            </Alert>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Tile rotulo="Dias de direito" valor={r.direito} />
            <Tile
              rotulo="Abono pecuniário"
              valor={
                periodo.abono_pecuniario === true ? `${r.abono} dias` : "—"
              }
            />
            <Tile rotulo="Descanso disponível" valor={r.descanso} />
            <Tile rotulo="Dias gozados" valor={r.gozados} />
            <Tile rotulo="Saldo" valor={r.saldo} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Gozos do período
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  {periodo.gozos.length} de até 3
                </span>
              </CardTitle>
              <CardDescription>
                O término exibido é a data de retorno ao trabalho. Autorizar
                avisa o funcionário por notificação e email.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead>Início</TableHead>
                      <TableHead>Retorno</TableHead>
                      <TableHead className="text-right">Dias</TableHead>
                      <TableHead>Autorização</TableHead>
                      <TableHead className="hidden md:table-cell">
                        Observações
                      </TableHead>
                      <TableHead>Aviso</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {periodo.gozos.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={7}
                          className="text-muted-foreground h-20 text-center text-sm"
                        >
                          Nenhum gozo registrado neste período.
                        </TableCell>
                      </TableRow>
                    )}
                    {periodo.gozos.map((g) => (
                      <TableRow key={g.id}>
                        <TableCell className="font-medium whitespace-nowrap">
                          {formatarData(g.inicio)}
                        </TableCell>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {formatarData(g.termino)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {g.dias ?? "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            {g.autorizado === true ? (
                              <Badge
                                variant="outline"
                                className="border-success/40 text-success-fg"
                              >
                                Autorizado
                                {g.data_autorizacao
                                  ? ` em ${formatarData(g.data_autorizacao)}`
                                  : ""}
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-warning/40 text-warning-fg"
                              >
                                Aguardando
                              </Badge>
                            )}
                            {g.abono_solicitado === true && (
                              <Badge
                                variant="outline"
                                className="border-info/40 text-info-fg"
                                title="Funcionário pediu vender 1/3 (abono). Autorizar o gozo confirma o abono."
                              >
                                Abono 1/3
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden max-w-48 truncate md:table-cell">
                          {g.autorizador_observacoes ?? "—"}
                        </TableCell>
                        <TableCell>
                          {urls.get(g.id) ? (
                            <a
                              href={urls.get(g.id)!}
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
                          <div className="flex items-center justify-end gap-1">
                            <AutorizarGozoBotao
                              periodoId={id}
                              gozoId={g.id}
                              autorizado={g.autorizado === true}
                              temAbono={g.abono_solicitado === true}
                            />
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                              className="h-7 px-2"
                            >
                              <Link
                                href={`/painel/pessoal/ferias/${id}?editar=${g.id}`}
                              >
                                Editar
                              </Link>
                            </Button>
                            <ExcluirGozoBotao periodoId={id} gozoId={g.id} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {finalizado ? (
            <Alert>
              <AlertDescription>
                Período finalizado — para registrar novos gozos, reabra o
                período em “Editar período”.
              </AlertDescription>
            </Alert>
          ) : periodo.gozos.length >= 3 && !gozoEmEdicao ? (
            <Alert>
              <AlertDescription>
                O período já tem 3 gozos — o máximo permitido pela CLT.
              </AlertDescription>
            </Alert>
          ) : (
            /* key força remontagem ao alternar criar/editar (defaultValue). */
            <GozoForm
              key={gozoEmEdicao?.id ?? "novo"}
              periodoId={id}
              saldo={gozoEmEdicao ? r.saldo + (gozoEmEdicao.dias ?? 0) : r.saldo}
              jaTemGozos={
                gozoEmEdicao
                  ? periodo.gozos.length > 1
                  : periodo.gozos.length >= 1
              }
              gozo={
                gozoEmEdicao
                  ? {
                      id: gozoEmEdicao.id,
                      inicio: gozoEmEdicao.inicio,
                      dias: gozoEmEdicao.dias,
                      autorizador_observacoes:
                        gozoEmEdicao.autorizador_observacoes,
                      temAviso: Boolean(gozoEmEdicao.aviso_ferias_url),
                    }
                  : undefined
              }
            />
          )}
        </>
      )}
    </>
  )
}
