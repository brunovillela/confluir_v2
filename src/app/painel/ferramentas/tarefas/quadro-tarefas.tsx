"use client"

import { BookOpen, Repeat } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Quadro } from "@/components/quadro"
import type { TarefaLinha } from "@/lib/db/nucleo"
import { formatarData } from "@/lib/formato"
import {
  COLUNAS_QUADRO_TAREFA,
  colunaDaTarefa,
  ROTULOS_COLUNA_TAREFA,
  ROTULOS_PAI_TAREFA,
  ROTULOS_PRIORIDADE_TAREFA,
} from "@/lib/nucleo-constantes"

import { moverTarefaAction } from "./actions"
import { ConversaTarefa } from "./conversa-tarefa"

const COR_PRIORIDADE = {
  alta: "border-destructive/40 text-destructive",
  media: "text-muted-foreground",
  baixa: "text-muted-foreground border-dashed",
} as const

/**
 * Quadro de tarefas (A fazer · Em andamento · Feito). Arrastar para Feito
 * conclui (a recorrente cria a próxima); sair de Feito reabre.
 */
export function QuadroTarefas({ tarefas, diasFeito }: { tarefas: TarefaLinha[]; diasFeito: number }) {
  return (
    <Quadro
      rotulo="a tarefa"
      itens={tarefas}
      colunaDe={(t) => colunaDaTarefa(t)}
      mover={moverTarefaAction}
      colunas={COLUNAS_QUADRO_TAREFA.map((c) => ({
        id: c,
        titulo: ROTULOS_COLUNA_TAREFA[c],
        rodape:
          c === "feito" ? (
            <p className="text-muted-foreground px-1 text-[11px]">Concluídas nos últimos {diasFeito} dias.</p>
          ) : undefined,
      }))}
      vazio="Nenhuma tarefa."
      cartao={(t) => (
        <div className="grid gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <span className={`font-medium ${t.concluido ? "text-muted-foreground line-through" : ""}`}>
              {t.titulo ?? "(sem título)"}
              {t.recorrencia && <Repeat className="text-muted-foreground ml-1 inline size-3.5 align-[-2px]" aria-label="Repete" />}
              {t.procedimentoId && (
                <a
                  href={`/painel/perfil/tarefas/procedimento/${t.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary ml-1 inline-flex align-[-2px]"
                  title={`Procedimento: ${t.procedimentoNome ?? "abrir"}`}
                  aria-label={`Abrir o procedimento ${t.procedimentoNome ?? ""}`.trim()}
                  draggable={false}
                >
                  <BookOpen className="size-3.5" />
                </a>
              )}
            </span>
            <span className="-mt-1 -mr-1 shrink-0">
              <ConversaTarefa tarefaId={t.id} titulo={t.titulo} quantidade={t.mensagens} />
            </span>
          </div>
          {t.paiTipo && (
            <span className="text-muted-foreground line-clamp-1 text-xs">
              {ROTULOS_PAI_TAREFA[t.paiTipo]}
              {t.paiNome ? `: ${t.paiNome}` : ""}
            </span>
          )}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant="outline" className={COR_PRIORIDADE[t.prioridade]}>
              {ROTULOS_PRIORIDADE_TAREFA[t.prioridade]}
            </Badge>
            {t.prazo && (
              <span className={t.situacao === "atrasada" ? "text-destructive font-medium" : "text-muted-foreground"}>
                {t.situacao === "atrasada" ? "Atrasada · " : ""}
                {formatarData(t.prazo)}
              </span>
            )}
            <span className="text-muted-foreground ml-auto truncate">{t.demandadoNome ?? "Sem responsável"}</span>
          </div>
        </div>
      )}
    />
  )
}
