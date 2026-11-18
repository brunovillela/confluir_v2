import type { Metadata } from "next"
import type { ReactNode } from "react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CheckCircle2, Circle, Pencil } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarPessoasAtribuiveis, obterAnomalia } from "@/lib/db/nucleo"
import { formatarData } from "@/lib/formato"
import {
  derivarEstagioAnomalia,
  ROTULOS_ESTAGIO_ANOMALIA,
} from "@/lib/nucleo-constantes"

import { Linha } from "../../dados-resumo"
import { IncluirTarefas } from "../../tarefas/tarefa-forms"
import { TarefasLista } from "../../tarefas/tarefas-lista"

export const metadata: Metadata = { title: "Anomalia — Confluir" }

export default async function AnomaliaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("ferramentas_anomalias")
  const { id } = await params
  const { salvo } = await searchParams

  const [anomalia, pessoas] = await Promise.all([
    obterAnomalia(id),
    listarPessoasAtribuiveis(),
  ])
  if (!anomalia) notFound()

  const estagio = derivarEstagioAnomalia({
    anomalia_investigada: anomalia.investigada,
    anomalia_tratada: anomalia.tratada,
    eficacia_verificada: anomalia.eficaciaVerificada,
  })
  const porquesPreenchidos = anomalia.porques.filter(Boolean)

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link href="/painel/ferramentas/anomalias">
          <ArrowLeft />
          Anomalias
        </Link>
      </Button>

      {salvo && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Anomalia salva com sucesso.</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {anomalia.fato ?? "(sem fato)"}
          </h1>
          <Badge
            variant="outline"
            className={
              anomalia.eficaciaVerificada
                ? "text-muted-foreground"
                : "border-warning/40 text-warning-fg"
            }
          >
            {ROTULOS_ESTAGIO_ANOMALIA[estagio]}
          </Badge>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/painel/ferramentas/anomalias/${id}/editar`}>
            <Pencil />
            Editar
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent>
            <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-muted-foreground text-xs">Conformidade (o que era esperado)</dt>
                <dd className="mt-0.5 whitespace-pre-wrap">{anomalia.conformidade ?? "—"}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-muted-foreground text-xs">Descrição detalhada</dt>
                <dd className="mt-0.5 whitespace-pre-wrap">{anomalia.descricaoDetalhada ?? "—"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-3">
            <dl className="grid gap-1.5 text-sm">
              <Linha rotulo="Apuração">{anomalia.responsavelNome ?? "—"}</Linha>
              <Linha rotulo="Ocorrência">
                {anomalia.dataOcorrencia ? formatarData(anomalia.dataOcorrencia) : "—"}
              </Linha>
            </dl>
            <ol className="grid gap-1.5 border-t pt-3 text-sm" aria-label="Etapas da anomalia">
              <Etapa feita={anomalia.investigada}>Investigada</Etapa>
              <Etapa feita={anomalia.tratada}>Tratada</Etapa>
              <Etapa feita={anomalia.eficaciaVerificada}>Eficácia verificada</Etapa>
            </ol>
          </CardContent>
        </Card>
      </div>

      {(porquesPreenchidos.length > 0 || anomalia.causaRaiz) && (
        <Card>
          <CardContent>
            <p className="mb-3 text-sm font-medium">Investigação</p>
            <div className="grid gap-4 lg:grid-cols-2">
              {porquesPreenchidos.length > 0 && (
                <ol className="grid content-start gap-1.5 text-sm">
                  {anomalia.porques.map((p, i) =>
                    p ? (
                      <li key={i} className="flex gap-2">
                        <span className="text-muted-foreground shrink-0">
                          Por quê {i + 1}:
                        </span>
                        <span>{p}</span>
                      </li>
                    ) : null
                  )}
                </ol>
              )}
              {anomalia.causaRaiz && (
                <div className="text-sm">
                  <p className="text-muted-foreground text-xs">Causa raiz</p>
                  <p className="mt-0.5 whitespace-pre-wrap">{anomalia.causaRaiz}</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid gap-4">
          <IncluirTarefas
            pessoas={pessoas}
            pai={{ campo: "anomalia_id", id }}
            avulsas={[]}
            rotuloNova="Nova providência"
            cabecalho={
              <p className="text-sm font-medium">
                Providências{" "}
                <span className="text-muted-foreground font-normal">
                  (tarefas — {anomalia.providencias.length})
                </span>
              </p>
            }
          />
          <TarefasLista
            tarefas={anomalia.providencias}
            pai={{ campo: "anomalia_id", id }}
            vazio="Nenhuma providência registrada ainda."
            pessoas={pessoas}
          />
        </CardContent>
      </Card>
    </>
  )
}

function Etapa({ feita, children }: { feita: boolean; children: ReactNode }) {
  return (
    <li className={`flex items-center gap-2 ${feita ? "" : "text-muted-foreground"}`}>
      {feita ? (
        <CheckCircle2 className="text-success-fg size-4 shrink-0" aria-hidden />
      ) : (
        <Circle className="size-4 shrink-0" aria-hidden />
      )}
      {children}
      <span className="sr-only">{feita ? "(feito)" : "(pendente)"}</span>
    </li>
  )
}
