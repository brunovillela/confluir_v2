import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CalendarClock } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarFuncionarios } from "@/lib/db/pessoal"
import { listarJornadas } from "@/lib/db/pessoal-sst"
import {
  DIAS_SEMANA,
  formatarHora,
  formatarTempoMes,
} from "@/lib/pessoal-sst-constantes"

import { JornadaForm } from "./jornada-form"

export const metadata: Metadata = { title: "Jornadas de trabalho — Confluir" }

export default async function JornadasPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>
}) {
  await requirePermissao("pessoal_gestao")
  const { id } = await searchParams

  const funcionarios = await listarFuncionarios({ situacao: "ativos" })
  const linhas = await listarJornadas(
    funcionarios.linhas.map((l) => ({ usuarioId: l.usuarioId, nome: l.nome }))
  )
  const selecionado = id ? linhas.find((l) => l.funcionarioId === id) : null

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/pessoal/atribuicoes">
            <ArrowLeft />
            Atribuições
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Jornadas de trabalho contratadas
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Dias e horários de trabalho de cada funcionário. Base do % de
          ocupação (quanto as tarefas consomem da disponibilidade) e do alerta
          de acesso fora do horário.
        </p>
      </div>

      {selecionado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Jornada de {selecionado.nome ?? "(sem nome)"}
            </CardTitle>
            <CardDescription>
              {selecionado.minSemana > 0
                ? `${formatarTempoMes(selecionado.minSemana)} por semana (~${formatarTempoMes(selecionado.minMes)}/mês).`
                : "Nenhuma jornada cadastrada ainda."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <JornadaForm
              funcionarioId={selecionado.funcionarioId}
              dias={selecionado.dias}
            />
          </CardContent>
        </Card>
      )}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Funcionário</TableHead>
              <TableHead className="hidden sm:table-cell">Função</TableHead>
              <TableHead className="hidden md:table-cell">Dias</TableHead>
              <TableHead className="text-right">Semana</TableHead>
              <TableHead className="text-right">Mês (~)</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-32">
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                    <CalendarClock className="size-6" />
                    <p className="text-sm">Nenhum funcionário ativo.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {linhas.map((l) => {
              const resumo = l.dias
                .map((d) => {
                  const dia = DIAS_SEMANA.find((x) => x.valor === d.dia_semana)
                  return `${dia?.curto ?? d.dia_semana} ${formatarHora(d.hora_inicio)}–${formatarHora(d.hora_fim)}`
                })
                .join(" · ")
              return (
                <TableRow key={l.funcionarioId}>
                  <TableCell className="font-medium">
                    {l.nome ?? "(sem nome)"}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">
                    {l.funcaoNome ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden max-w-md truncate md:table-cell">
                    {resumo || "sem jornada"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.minSemana > 0 ? formatarTempoMes(l.minSemana) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.minMes > 0 ? formatarTempoMes(l.minMes) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link
                        href={`/painel/pessoal/atribuicoes/jornadas?id=${l.funcionarioId}`}
                      >
                        {l.minSemana > 0 ? "Editar" : "Cadastrar"}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
