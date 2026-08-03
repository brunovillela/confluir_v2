import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Pencil } from "lucide-react"

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

import { AdicionarTarefa } from "../../tarefas/tarefa-forms"
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
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/ferramentas/anomalias">
            <ArrowLeft />
            Anomalias
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/painel/ferramentas/anomalias/${id}/editar`}>
            <Pencil />
            Editar
          </Link>
        </Button>
      </div>

      {salvo && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Anomalia salva com sucesso.</AlertDescription>
        </Alert>
      )}

      <div>
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
        <p className="text-muted-foreground mt-1 text-xs">
          {anomalia.responsavelNome
            ? `Apuração: ${anomalia.responsavelNome}`
            : "Sem responsável"}
          {anomalia.dataOcorrencia
            ? ` · Ocorrência ${formatarData(anomalia.dataOcorrencia)}`
            : ""}
        </p>
      </div>

      {(anomalia.conformidade || anomalia.descricaoDetalhada) && (
        <Card>
          <CardContent className="grid gap-3 text-sm">
            {anomalia.conformidade && (
              <div>
                <p className="text-muted-foreground text-xs">
                  Conformidade (o que era esperado)
                </p>
                <p className="mt-0.5 whitespace-pre-wrap">{anomalia.conformidade}</p>
              </div>
            )}
            {anomalia.descricaoDetalhada && (
              <div>
                <p className="text-muted-foreground text-xs">Descrição detalhada</p>
                <p className="mt-0.5 whitespace-pre-wrap">
                  {anomalia.descricaoDetalhada}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(porquesPreenchidos.length > 0 || anomalia.causaRaiz) && (
        <Card>
          <CardContent>
            <p className="mb-3 text-sm font-medium">Investigação</p>
            {porquesPreenchidos.length > 0 && (
              <ol className="mb-3 grid gap-1.5 text-sm">
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
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <p className="mb-3 text-sm font-medium">
            Providências{" "}
            <span className="text-muted-foreground font-normal">
              (tarefas — {anomalia.providencias.length})
            </span>
          </p>
          <div className="mb-4">
            <AdicionarTarefa pessoas={pessoas} pai={{ campo: "anomalia_id", id }} />
          </div>
          <TarefasLista
            tarefas={anomalia.providencias}
            pai={{ campo: "anomalia_id", id }}
            vazio="Nenhuma providência registrada ainda."
          />
        </CardContent>
      </Card>
    </>
  )
}
