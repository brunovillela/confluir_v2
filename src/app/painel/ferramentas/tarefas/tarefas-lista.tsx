import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { type TarefaLinha } from "@/lib/db/nucleo"
import { formatarData } from "@/lib/formato"
import {
  ROTULOS_PAI_TAREFA,
  ROTULOS_SITUACAO_TAREFA,
  type SituacaoTarefa,
} from "@/lib/nucleo-constantes"

import { ToggleTarefa, type PaiFixo } from "./tarefa-forms"

const CLASSE_SITUACAO: Record<SituacaoTarefa, string> = {
  concluida: "text-muted-foreground",
  atrasada: "border-destructive/40 text-destructive",
  pendente: "border-warning/40 text-warning-fg",
}

const ROTA_PAI: Record<"demanda" | "projeto" | "anomalia", string> = {
  demanda: "/painel/ferramentas/demandas",
  projeto: "/painel/ferramentas/projetos",
  anomalia: "/painel/ferramentas/anomalias",
}

/**
 * Tabela de tarefas. Com `pai` fixo (dentro de uma Demanda/Anomalia) esconde a
 * coluna de vínculo; sem ele (lista global) mostra a que pai cada tarefa pertence.
 */
export function TarefasLista({
  tarefas,
  pai,
  vazio = "Nenhuma tarefa.",
}: {
  tarefas: TarefaLinha[]
  pai?: PaiFixo
  vazio?: string
}) {
  if (tarefas.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">{vazio}</p>
    )
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10" />
          <TableHead>Tarefa</TableHead>
          {!pai && <TableHead>Vínculo</TableHead>}
          <TableHead>Responsável</TableHead>
          <TableHead>Prazo</TableHead>
          <TableHead>Situação</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tarefas.map((t) => (
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
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            )}
            <TableCell className="whitespace-nowrap text-sm">
              {t.demandadoNome ?? "—"}
            </TableCell>
            <TableCell className="whitespace-nowrap text-sm">
              {t.prazo ? formatarData(t.prazo) : "—"}
            </TableCell>
            <TableCell>
              <Badge variant="outline" className={CLASSE_SITUACAO[t.situacao]}>
                {ROTULOS_SITUACAO_TAREFA[t.situacao]}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
