import type { Metadata } from "next"
import { ExternalLink, TreePalm } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requireSessaoPainel } from "@/lib/auth"
import { minhasFerias, resumoPeriodo } from "@/lib/db/ferias"
import { urlArquivoPessoal } from "@/lib/db/pessoal"
import { formatarData } from "@/lib/formato"

import { CancelarFeriasBotao, SolicitarFeriasForm } from "./solicitacao-form"

export const metadata: Metadata = { title: "Minhas férias — Confluir" }

/** Autosserviço: histórico de férias + solicitação de gozo pelo funcionário. */
export default async function MinhasFeriasPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>
}) {
  const sessao = await requireSessaoPainel()
  const { salvo } = await searchParams
  const ferias = await minhasFerias(sessao.usuario.id)

  const urlsAvisos = new Map<string, string | null>()
  for (const p of ferias) {
    for (const g of p.gozos) {
      urlsAvisos.set(g.id, await urlArquivoPessoal(g.aviso_ferias_url))
    }
  }

  // Períodos com saldo de descanso a gozar — opções da solicitação.
  const disponiveis = ferias
    .filter((p) => p.finalizado !== true && resumoPeriodo(p).saldo > 0)
    .map((p) => {
      const r = resumoPeriodo(p)
      return {
        id: p.id,
        rotulo: `Aquisitivo ${formatarData(p.aquisitivo_inicio)}–${formatarData(p.aquisitivo_termino)} · saldo ${r.saldo} dia${r.saldo === 1 ? "" : "s"}`,
      }
    })

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Minhas férias</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Solicite seus períodos de gozo e acompanhe a autorização. O término de
          cada gozo é a data de retorno ao trabalho.
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Solicitação enviada — você será avisado quando for autorizada.
          </AlertDescription>
        </Alert>
      )}

      {disponiveis.length > 0 ? (
        <GrupoColapsavel
          titulo="Solicitar férias"
          descricao="Escolha um período com saldo e as datas do gozo"
        >
          <SolicitarFeriasForm periodos={disponiveis} />
        </GrupoColapsavel>
      ) : (
        <Alert>
          <AlertDescription>
            Você não tem saldo de férias a gozar no momento. Quando houver um
            período disponível, a solicitação aparecerá aqui.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Histórico de férias</CardTitle>
            <TreePalm className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            {ferias.length} período{ferias.length === 1 ? "" : "s"} — o término de
            cada gozo é a data de retorno ao trabalho
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {ferias.length === 0 && (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhum período de férias registrado para você ainda.
            </p>
          )}
          {ferias.map((p) => {
            const r = resumoPeriodo(p)
            return (
              <div key={p.id} className="rounded-lg border p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    Aquisitivo {formatarData(p.aquisitivo_inicio)} –{" "}
                    {formatarData(p.aquisitivo_termino)}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    direito {r.direito} dia{r.direito === 1 ? "" : "s"}
                    {p.abono_pecuniario === true && (
                      <> · abono 1/3 ({r.abono} dias vendidos)</>
                    )}{" "}
                    · gozados {r.gozados} · saldo{" "}
                    <span className="text-foreground font-medium">{r.saldo}</span>
                  </p>
                </div>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Gozos dentro do concessivo {formatarData(p.concessivo_inicio)} –{" "}
                  {formatarData(p.concessivo_termino)}
                </p>
                {p.gozos.length > 0 && (
                  <Table className="mt-3">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Início</TableHead>
                        <TableHead>Retorno</TableHead>
                        <TableHead className="text-right">Dias</TableHead>
                        <TableHead>Situação</TableHead>
                        <TableHead className="w-24">Aviso</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {p.gozos.map((g) => (
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
                                >
                                  Abono 1/3
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {urlsAvisos.get(g.id) ? (
                              <a
                                href={urlsAvisos.get(g.id)!}
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
                          <TableCell className="text-right">
                            <CancelarFeriasBotao
                              id={g.id}
                              autorizado={g.autorizado === true}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            )
          })}
        </CardContent>
      </Card>
    </>
  )
}
