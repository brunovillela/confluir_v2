import type { Metadata } from "next"
import Link from "next/link"
import { ListChecks, Plus, TriangleAlert } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarDemandas, resumoDemandas } from "@/lib/db/nucleo"
import { formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { SITUACOES_DEMANDA } from "@/lib/nucleo-constantes"

export const metadata: Metadata = { title: "Demandas — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const CLASSE_SITUACAO: Record<string, string> = {
  "A fazer": "border-warning/40 text-warning-fg",
  Fazendo: "border-primary/40 text-primary",
  Feito: "text-muted-foreground",
}

type Params = { busca?: string; situacao?: string; excluida?: string }

export default async function DemandasPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const sessao = await requirePermissao("ferramentas_demandas", [
    "ferramentas_tarefas",
    "ferramentas_anomalias",
  ])
  const editor = podeAcessar(sessao.permissoes, "ferramentas_demandas")

  const brutos = await searchParams
  const busca = (brutos.busca ?? "").trim()
  const excluida = brutos.excluida === "1"
  const situacao = (SITUACOES_DEMANDA as readonly string[]).includes(
    brutos.situacao ?? ""
  )
    ? brutos.situacao
    : ""

  const [resumo, demandas] = await Promise.all([
    resumoDemandas(),
    listarDemandas({ busca, situacao }),
  ])

  return (
    <>
      {excluida && (
        <Alert>
          <AlertDescription>Demanda excluída.</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Demandas</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Frentes de atuação com prazo, responsável e tarefas
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/painel/ferramentas/tarefas">
              <ListChecks />
              Tarefas
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/painel/ferramentas/anomalias">
              <TriangleAlert />
              Anomalias
            </Link>
          </Button>
          {editor && (
            <Button asChild>
              <Link href="/painel/ferramentas/demandas/nova">
                <Plus />
                Nova demanda
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CardResumo rotulo="Demandas" valor={resumo.total} />
        <CardResumo rotulo="A fazer" valor={resumo.aFazer} />
        <CardResumo rotulo="Fazendo" valor={resumo.fazendo} />
        <CardResumo rotulo="Feito" valor={resumo.feito} />
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        action="/painel/ferramentas/demandas"
      >
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Nome da demanda"
          className={`${SELECT_FILTRO} w-64 max-w-full`}
        />
        <select name="situacao" defaultValue={situacao} className={SELECT_FILTRO}>
          <option value="">Todas as situações</option>
          {SITUACOES_DEMANDA.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

      <Card>
        <CardContent>
          {demandas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <ListChecks className="mx-auto mb-2 size-5" />
              Nenhuma demanda encontrada com estes filtros.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Demanda</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Prazo</TableHead>
                  <TableHead>Tarefas</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {demandas.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell className="max-w-80">
                      <Link
                        href={`/painel/ferramentas/demandas/${d.id}`}
                        className="text-primary font-medium hover:underline"
                      >
                        <span className="line-clamp-2">{d.nome ?? "(sem nome)"}</span>
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {d.responsavelNome ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {d.prazo ? formatarData(d.prazo) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums text-sm">
                      {d.tarefasTotal > 0
                        ? `${d.tarefasConcluidas}/${d.tarefasTotal}`
                        : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          CLASSE_SITUACAO[d.situacao ?? ""] ?? "text-muted-foreground"
                        }
                      >
                        {d.situacao ?? "—"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function CardResumo({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <Card>
      <CardContent>
        <p className="text-muted-foreground text-xs">{rotulo}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {valor.toLocaleString("pt-BR")}
        </p>
      </CardContent>
    </Card>
  )
}
