"use client"

import Link from "next/link"

import { Quadro } from "@/components/quadro"
import { confirmar } from "@/components/ui/confirmacao"
import type { DemandaLinha } from "@/lib/db/nucleo"
import { formatarData } from "@/lib/formato"
import { avisoTarefasAoFinalizar, SITUACOES_DEMANDA } from "@/lib/nucleo-constantes"

import { definirSituacaoDemandaAction } from "./actions"

/**
 * Quadro de demandas (A fazer · Fazendo · Feito). Mover usa a mesma ação do
 * seletor de situação — com as mesmas regras (a demanda do portal não vai a
 * Feito direto) e o mesmo aviso: Feito conclui as tarefas abertas.
 */
export function QuadroDemandas({
  demandas,
  editor,
  feitoOcultas,
  hoje,
}: {
  demandas: DemandaLinha[]
  editor: boolean
  /** Quantas demandas Feito ficaram fora do quadro (as mais antigas). */
  feitoOcultas: number
  hoje: string
}) {
  return (
    <Quadro
      rotulo="a demanda"
      itens={demandas}
      colunaDe={(d) => d.situacao ?? "A fazer"}
      podeMover={() => editor}
      mover={async (id, situacao) => {
        const fd = new FormData()
        fd.set("demanda_id", id)
        fd.set("situacao", situacao)
        return definirSituacaoDemandaAction({}, fd)
      }}
      confirmar={async (d, destino) => {
        const abertas = d.tarefasTotal - d.tarefasConcluidas
        return destino !== "Feito" || abertas === 0 || confirmar(avisoTarefasAoFinalizar(abertas, "demanda"))
      }}
      colunas={SITUACOES_DEMANDA.map((s) => ({
        id: s,
        titulo: s,
        rodape:
          s === "Feito" && feitoOcultas > 0 ? (
            <Link href="/painel/ferramentas/demandas?situacao=Feito" className="text-primary px-1 text-[11px] hover:underline">
              Mais {feitoOcultas} feitas na lista
            </Link>
          ) : undefined,
      }))}
      vazio="Nenhuma demanda."
      cartao={(d) => (
        <div className="grid gap-1.5">
          <Link href={`/painel/ferramentas/demandas/${d.id}`} className="font-medium hover:underline" draggable={false}>
            {d.nome ?? "(sem nome)"}
          </Link>
          {d.tarefasTotal > 0 && (
            <div className="flex items-center gap-2">
              <div className="bg-muted h-1.5 flex-1 overflow-hidden rounded-full" aria-hidden>
                <div className="bg-primary h-full" style={{ width: `${(d.tarefasConcluidas / d.tarefasTotal) * 100}%` }} />
              </div>
              <span className="text-muted-foreground text-xs tabular-nums">
                {d.tarefasConcluidas}/{d.tarefasTotal}
              </span>
            </div>
          )}
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
            {d.prazo && (
              <span className={d.situacao !== "Feito" && d.prazo < hoje ? "text-destructive font-medium" : ""}>
                {d.situacao !== "Feito" && d.prazo < hoje ? "Atrasada · " : "Prazo "}
                {formatarData(d.prazo)}
              </span>
            )}
            <span className="ml-auto truncate">{d.responsavelNome ?? "Sem responsável"}</span>
          </div>
        </div>
      )}
    />
  )
}
