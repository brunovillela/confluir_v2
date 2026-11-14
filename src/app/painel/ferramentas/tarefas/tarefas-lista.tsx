"use client"

import { useSyncExternalStore } from "react"
import Link from "next/link"

import { PessoaNome } from "@/components/pessoa-nome"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { type OpcaoPessoa, type TarefaLinha } from "@/lib/db/nucleo"
import { formatarData } from "@/lib/formato"
import {
  ORDENS_TAREFAS,
  ordenarTarefas,
  ROTULOS_PAI_TAREFA,
  ROTULOS_PRIORIDADE_TAREFA,
  ROTULOS_SITUACAO_TAREFA,
  type OrdemTarefas,
  type PrioridadeTarefa,
  type SituacaoTarefa,
} from "@/lib/nucleo-constantes"

import { AcoesTarefa, DesvincularTarefa, ToggleTarefa, type PaiFixo } from "./tarefa-forms"

const CLASSE_SITUACAO: Record<SituacaoTarefa, string> = {
  concluida: "text-muted-foreground",
  atrasada: "border-destructive/40 text-destructive",
  pendente: "border-warning/40 text-warning-fg",
}

const CLASSE_PRIORIDADE: Record<PrioridadeTarefa, string> = {
  alta: "border-destructive/40 text-destructive",
  media: "text-foreground",
  baixa: "text-muted-foreground",
}

/** A ordem escolhida fica no navegador e vale para todas as listas de tarefas. */
const CHAVE_ORDEM = "tarefas_ordem"
const EVENTO_ORDEM = "tarefas-ordem"
// Sem acesso ao armazenamento (navegação privada, bloqueio), a escolha vale até recarregar.
let ordemEmMemoria: OrdemTarefas = "prazo"

function lerOrdem(): OrdemTarefas {
  try {
    const salva = localStorage.getItem(CHAVE_ORDEM)
    return salva === "prioridade" || salva === "prazo" ? salva : ordemEmMemoria
  } catch {
    return ordemEmMemoria
  }
}

function assinarOrdem(avisar: () => void): () => void {
  window.addEventListener(EVENTO_ORDEM, avisar)
  window.addEventListener("storage", avisar)
  return () => {
    window.removeEventListener(EVENTO_ORDEM, avisar)
    window.removeEventListener("storage", avisar)
  }
}

function gravarOrdem(nova: OrdemTarefas): void {
  ordemEmMemoria = nova
  try {
    localStorage.setItem(CHAVE_ORDEM, nova)
  } catch {
    // sem armazenamento: a troca não fica lembrada
  }
  window.dispatchEvent(new Event(EVENTO_ORDEM))
}

const ROTA_PAI: Record<"demanda" | "projeto" | "anomalia", string> = {
  demanda: "/painel/ferramentas/demandas",
  projeto: "/painel/ferramentas/projetos",
  anomalia: "/painel/ferramentas/anomalias",
}

/**
 * Tabela de tarefas. Com `pai` fixo (dentro de uma Demanda/Anomalia) esconde a
 * coluna de vínculo; sem ele (lista global) mostra a que pai cada tarefa pertence.
 * Ordena por prazo ou por prioridade (escolha lembrada no navegador).
 */
export function TarefasLista({
  tarefas,
  pai,
  vazio = "Nenhuma tarefa.",
  desvincular = false,
  pessoas,
}: {
  tarefas: TarefaLinha[]
  pai?: PaiFixo
  vazio?: string
  /** Com `pai`: botão para tirar a tarefa da demanda/projeto (ela fica avulsa). */
  desvincular?: boolean
  /** Com a lista de responsáveis possíveis, cada linha ganha Editar e Excluir. */
  pessoas?: OpcaoPessoa[]
}) {
  const comAcoes = Boolean(pessoas) || Boolean(pai && desvincular)
  // O servidor não conhece a escolha do navegador: lá, e na hidratação, é o prazo.
  const ordem = useSyncExternalStore(assinarOrdem, lerOrdem, () => "prazo" as const)

  if (tarefas.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">{vazio}</p>
    )
  }
  const ordenadas = ordenarTarefas(tarefas, ordem)
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-end gap-2 text-xs">
        <span className="text-muted-foreground" id="rotulo-ordem-tarefas">
          Ordenar por
        </span>
        <div className="bg-muted inline-flex rounded-md p-0.5" role="group" aria-labelledby="rotulo-ordem-tarefas">
          {ORDENS_TAREFAS.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => gravarOrdem(o)}
              aria-pressed={ordem === o}
              className={`rounded px-2 py-1 transition-colors ${
                ordem === o ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {o === "prazo" ? "Prazo" : "Prioridade"}
            </button>
          ))}
        </div>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10" />
            <TableHead>Tarefa</TableHead>
            {!pai && <TableHead>Vínculo</TableHead>}
            <TableHead>Responsável</TableHead>
            <TableHead>Prazo</TableHead>
            <TableHead>Prioridade</TableHead>
            <TableHead>Situação</TableHead>
            {comAcoes && <TableHead className="w-px"><span className="sr-only">Ações</span></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {ordenadas.map((t) => (
            <TableRow key={t.id}>
              <TableCell className="py-1">
                <ToggleTarefa tarefaId={t.id} concluido={t.concluido} pai={pai} />
              </TableCell>
              <TableCell className="max-w-80">
                <span
                  className={`line-clamp-2 ${t.concluido ? "text-muted-foreground line-through" : ""}`}
                >
                  {t.titulo ?? "(sem título)"}
                </span>
              </TableCell>
              {!pai && (
                <TableCell className="whitespace-nowrap text-sm">
                  {t.paiTipo && t.paiId ? (
                    <Link
                      href={`${ROTA_PAI[t.paiTipo]}/${t.paiId}`}
                      className="hover:underline"
                    >
                      <span className="text-muted-foreground">
                        {ROTULOS_PAI_TAREFA[t.paiTipo]}:
                      </span>{" "}
                      <span className="line-clamp-1 inline">{t.paiNome ?? "—"}</span>
                    </Link>
                  ) : t.paiTipo ? (
                    // Pai sem id: vínculo restrito (anomalia para quem não tem a permissão).
                    <span className="text-muted-foreground" title="Sem acesso ao conteúdo">
                      {ROTULOS_PAI_TAREFA[t.paiTipo]}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
              )}
              <TableCell className="whitespace-nowrap text-sm">
                {t.demandadoNome ? <PessoaNome nome={t.demandadoNome} fotoUrl={t.demandadoFotoUrl} /> : "—"}
              </TableCell>
              <TableCell className="whitespace-nowrap text-sm">
                {t.prazo ? formatarData(t.prazo) : "—"}
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={CLASSE_PRIORIDADE[t.prioridade]}>
                  {ROTULOS_PRIORIDADE_TAREFA[t.prioridade]}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={CLASSE_SITUACAO[t.situacao]}>
                  {ROTULOS_SITUACAO_TAREFA[t.situacao]}
                </Badge>
              </TableCell>
              {comAcoes && (
                <TableCell className="py-1">
                  <div className="flex items-center justify-end">
                    {pessoas && <AcoesTarefa tarefa={t} pessoas={pessoas} />}
                    {pai && desvincular && <DesvincularTarefa tarefaId={t.id} titulo={t.titulo} pai={pai} />}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
