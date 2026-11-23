import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, BookOpen, Flag, ListChecks, SquareCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { opcoesDeProcedimento } from "@/lib/db/documentos"
import { obterModelo } from "@/lib/db/modelos"
import { rotuloDias } from "@/lib/ferramentas-regras"
import { ROTULOS_PRIORIDADE_TAREFA } from "@/lib/nucleo-constantes"

import { EditarModelo, ExcluirItemModelo, NovoItemModelo } from "../modelos-forms"

export const metadata: Metadata = { title: "Modelo — Confluir" }

export default async function ModeloPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissao("ferramentas_demandas")
  const { id } = await params
  const [modelo, procedimentos] = await Promise.all([obterModelo(id), opcoesDeProcedimento()])
  if (!modelo) notFound()
  const nomeProc = new Map(procedimentos.map((p) => [p.id, p.nome]))
  const itens = [...modelo.itens].sort((a, b) => a.dias - b.dias)

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link href="/painel/ferramentas/modelos">
          <ArrowLeft />
          Modelos e pedidos
        </Link>
      </Button>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{modelo.nome}</h1>
        <Badge variant="outline">{modelo.tipo === "projeto" ? "Modelo de projeto" : "Modelo de demanda"}</Badge>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="grid gap-3">
            <div>
              <p className="text-sm font-medium">
                {modelo.tipo === "projeto" ? "Tarefas e marcos" : "Tarefas"}{" "}
                <span className="text-muted-foreground font-normal">({itens.length})</span>
              </p>
              <p className="text-muted-foreground text-xs">
                O prazo de cada um conta a partir da data de referência informada ao usar o modelo (o dia do evento, por exemplo).
              </p>
            </div>
            {itens.length === 0 ? (
              <p className="text-muted-foreground py-4 text-center text-sm">Nada no modelo ainda. Adicione abaixo.</p>
            ) : (
              <ul className="grid divide-y">
                {itens.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      {i.tipo === "marco" ? (
                        <Flag className="text-muted-foreground size-4 shrink-0" aria-label="Marco" />
                      ) : (
                        <SquareCheck className="text-muted-foreground size-4 shrink-0" aria-label="Tarefa" />
                      )}
                      <span className="truncate font-medium">{i.titulo}</span>
                    </span>
                    <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                      <span className="tabular-nums">{rotuloDias(i.dias)}</span>
                      {i.tipo === "tarefa" && <Badge variant="outline">{ROTULOS_PRIORIDADE_TAREFA[i.prioridade]}</Badge>}
                      {i.procedimentoId && (
                        <span className="inline-flex items-center gap-1" title="Procedimento">
                          <BookOpen className="size-3.5" />
                          {nomeProc.get(i.procedimentoId) ?? "procedimento"}
                        </span>
                      )}
                      {i.checklist.length > 0 && (
                        <span className="inline-flex items-center gap-1" title={i.checklist.join(" · ")}>
                          <ListChecks className="size-3.5" />
                          {i.checklist.length}
                        </span>
                      )}
                      <ExcluirItemModelo id={i.id} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t pt-3">
              <p className="mb-2 text-sm font-medium">Adicionar ao modelo</p>
              <NovoItemModelo modeloId={modelo.id} projeto={modelo.tipo === "projeto"} procedimentos={procedimentos} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-2">
            <p className="text-sm font-medium">Sobre o modelo</p>
            <EditarModelo id={modelo.id} nome={modelo.nome} descricao={modelo.descricao} />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
