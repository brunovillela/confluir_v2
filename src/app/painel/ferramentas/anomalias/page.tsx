import type { Metadata } from "next"
import Link from "next/link"
import { ListChecks, Plus, TriangleAlert } from "lucide-react"

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
import { listarAnomalias, resumoAnomalias } from "@/lib/db/nucleo"
import { formatarData } from "@/lib/formato"
import {
  derivarEstagioAnomalia,
  ROTULOS_ESTAGIO_ANOMALIA,
} from "@/lib/nucleo-constantes"

export const metadata: Metadata = { title: "Anomalias — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Params = { busca?: string; estagio?: string }

export default async function AnomaliasPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  await requirePermissao("ferramentas_anomalias")

  const brutos = await searchParams
  const busca = (brutos.busca ?? "").trim()
  const estagio =
    brutos.estagio === "verificadas" || brutos.estagio === "todas"
      ? brutos.estagio
      : "abertas"

  const [resumo, anomalias] = await Promise.all([
    resumoAnomalias(),
    listarAnomalias({ busca, estagio }),
  ])

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Anomalias</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Não conformidades, causa raiz e providências
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/painel/ferramentas/demandas">
              <ListChecks />
              Demandas
            </Link>
          </Button>
          <Button asChild>
            <Link href="/painel/ferramentas/anomalias/nova">
              <Plus />
              Nova anomalia
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <CardResumo rotulo="Anomalias" valor={resumo.total} />
        <CardResumo rotulo="Em aberto" valor={resumo.abertas} />
        <CardResumo rotulo="Eficácia verificada" valor={resumo.verificadas} />
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        action="/painel/ferramentas/anomalias"
      >
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Fato"
          className={`${SELECT_FILTRO} w-64 max-w-full`}
        />
        <select name="estagio" defaultValue={estagio} className={SELECT_FILTRO}>
          <option value="abertas">Em aberto</option>
          <option value="verificadas">Verificadas</option>
          <option value="todas">Todas</option>
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

      <Card>
        <CardContent>
          {anomalias.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <TriangleAlert className="mx-auto mb-2 size-5" />
              Nenhuma anomalia encontrada com estes filtros.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fato</TableHead>
                  <TableHead>Ocorrência</TableHead>
                  <TableHead>Responsável</TableHead>
                  <TableHead>Providências</TableHead>
                  <TableHead>Estágio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {anomalias.map((a) => {
                  const estagioAtual = derivarEstagioAnomalia({
                    anomalia_investigada: a.investigada,
                    anomalia_tratada: a.tratada,
                    eficacia_verificada: a.eficaciaVerificada,
                  })
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="max-w-96">
                        <Link
                          href={`/painel/ferramentas/anomalias/${a.id}`}
                          className="text-primary font-medium hover:underline"
                        >
                          <span className="line-clamp-2">{a.fato ?? "(sem fato)"}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {a.dataOcorrencia ? formatarData(a.dataOcorrencia) : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {a.responsavelNome ?? "—"}
                      </TableCell>
                      <TableCell className="tabular-nums text-sm">
                        {a.providencias > 0 ? a.providencias : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            a.eficaciaVerificada
                              ? "text-muted-foreground"
                              : "border-warning/40 text-warning-fg"
                          }
                        >
                          {ROTULOS_ESTAGIO_ANOMALIA[estagioAtual]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })}
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
