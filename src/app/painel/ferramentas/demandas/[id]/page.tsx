import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Pencil } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarPessoasAtribuiveis, obterDemanda } from "@/lib/db/nucleo"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { AdicionarTarefa } from "../../tarefas/tarefa-forms"
import { TarefasLista } from "../../tarefas/tarefas-lista"
import { SituacaoDemanda } from "./demanda-acoes"

export const metadata: Metadata = { title: "Demanda — Confluir" }

export default async function DemandaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("ferramentas_demandas", [
    "ferramentas_tarefas",
    "ferramentas_anomalias",
  ])
  const { id } = await params
  const { salvo } = await searchParams

  const [demanda, pessoas] = await Promise.all([
    obterDemanda(id),
    listarPessoasAtribuiveis(),
  ])
  if (!demanda) notFound()

  const concluidas = demanda.tarefas.filter((t) => t.concluido).length

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/ferramentas/demandas">
            <ArrowLeft />
            Demandas
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/painel/ferramentas/demandas/${id}/editar`}>
            <Pencil />
            Editar
          </Link>
        </Button>
      </div>

      {salvo && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Demanda salva com sucesso.</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {demanda.nome ?? "(sem nome)"}
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {demanda.responsavelNome
              ? `Responsável: ${demanda.responsavelNome}`
              : "Sem responsável"}
            {demanda.prazo ? ` · Prazo ${formatarData(demanda.prazo)}` : ""}
            {demanda.orcamento != null
              ? ` · ${formatarMoeda(demanda.orcamento)}`
              : ""}
          </p>
        </div>
        <SituacaoDemanda demandaId={id} situacao={demanda.situacao} />
      </div>

      {demanda.descricao && (
        <Card>
          <CardContent>
            <p className="text-muted-foreground mb-2 text-xs">Descrição</p>
            <p className="text-sm whitespace-pre-wrap">{demanda.descricao}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <p className="mb-3 text-sm font-medium">
            Tarefas{" "}
            <span className="text-muted-foreground font-normal">
              ({concluidas}/{demanda.tarefas.length})
            </span>
          </p>
          <div className="mb-4">
            <AdicionarTarefa pessoas={pessoas} pai={{ campo: "demanda_id", id }} />
          </div>
          <TarefasLista
            tarefas={demanda.tarefas}
            pai={{ campo: "demanda_id", id }}
            vazio="Nenhuma tarefa nesta demanda ainda."
          />
        </CardContent>
      </Card>
    </>
  )
}
