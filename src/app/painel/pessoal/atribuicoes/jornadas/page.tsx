import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CalendarClock, Plus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { listarJornadas, listarJornadasModelo } from "@/lib/db/pessoal-sst"
import {
  DIAS_SEMANA,
  formatarHora,
  formatarTempoMes,
  type JornadaDia,
} from "@/lib/pessoal-sst-constantes"

import { ExcluirJornada, JornadaForm } from "./jornada-form"
import { VincularJornadas } from "./vincular-form"

export const metadata: Metadata = { title: "Jornadas de trabalho — Confluir" }

/** "Seg a Sex 08:00–17:00 · Sáb 08:00–12:00": dias seguidos com o mesmo horário juntos. */
function resumoDias(dias: JornadaDia[]): string {
  const grupos: { de: number; ate: number; horario: string }[] = []
  for (const d of dias) {
    const horario = `${formatarHora(d.hora_inicio)}–${formatarHora(d.hora_fim)}`
    const pos = DIAS_SEMANA.findIndex((x) => x.valor === d.dia_semana)
    const ult = grupos.at(-1)
    if (ult && ult.horario === horario && ult.ate === pos - 1) ult.ate = pos
    else grupos.push({ de: pos, ate: pos, horario })
  }
  return grupos
    .map((g) => {
      const de = DIAS_SEMANA[g.de]?.curto
      const ate = DIAS_SEMANA[g.ate]?.curto
      const dias = g.de === g.ate ? de : g.ate === g.de + 1 ? `${de} e ${ate}` : `${de} a ${ate}`
      return `${dias} ${g.horario}`
    })
    .join(" · ")
}

export default async function JornadasPage({
  searchParams,
}: {
  searchParams: Promise<{ jornada?: string; nova?: string; criada?: string; excluida?: string }>
}) {
  await requirePermissao("pessoal_gestao")
  const { jornada: jornadaId, nova, criada, excluida } = await searchParams

  const [funcionarios, jornadas] = await Promise.all([
    listarFuncionarios({ situacao: "ativos" }),
    listarJornadasModelo(),
  ])
  const linhas = await listarJornadas(
    funcionarios.linhas.map((l) => ({ usuarioId: l.usuarioId, nome: l.nome }))
  )
  const nomePorId = new Map(linhas.map((l) => [l.funcionarioId, l.nome]))
  const selecionada = jornadaId ? jornadas.find((j) => j.id === jornadaId) : null
  const editando = Boolean(selecionada || nova)
  const semJornada = linhas.filter((l) => !l.jornadaId).length

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
            <Link href="/painel/pessoal/atribuicoes">
              <ArrowLeft />
              Atribuições
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            Jornadas de trabalho
          </h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-xs">
            Configure as jornadas da entidade uma vez e vincule cada funcionário
            a uma delas. Mudou o horário? Altere a jornada e vale para todos os
            vinculados. É a base do % de ocupação e do alerta de acesso fora do
            horário.
          </p>
        </div>
        {!editando && (
          <Button asChild>
            <Link href="/painel/pessoal/atribuicoes/jornadas?nova=1">
              <Plus />
              Nova jornada
            </Link>
          </Button>
        )}
      </div>

      {excluida && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Jornada excluída.</AlertDescription>
        </Alert>
      )}

      {editando && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
            <div className="grid gap-1.5">
              <CardTitle className="text-base">
                {selecionada ? selecionada.nome : "Nova jornada"}
              </CardTitle>
              <CardDescription>
                {selecionada
                  ? `${selecionada.minSemana > 0 ? `${formatarTempoMes(selecionada.minSemana)} por semana (~${formatarTempoMes(selecionada.minMes)}/mês) · ` : ""}${
                      selecionada.funcionarioIds.length === 0
                        ? "nenhum funcionário vinculado"
                        : selecionada.funcionarioIds.length === 1
                          ? "1 funcionário vinculado"
                          : `${selecionada.funcionarioIds.length} funcionários vinculados`
                    }`
                  : "Dê um nome e informe o horário de cada dia. Depois, vincule os funcionários na lista abaixo."}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              {selecionada && selecionada.funcionarioIds.length === 0 && (
                <ExcluirJornada id={selecionada.id} />
              )}
              <Button asChild variant="ghost" size="sm">
                <Link href="/painel/pessoal/atribuicoes/jornadas">Fechar</Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            {criada && selecionada && (
              <Alert className="border-success/40 text-success-fg">
                <AlertDescription>
                  Jornada criada. Agora vincule os funcionários na lista abaixo.
                </AlertDescription>
              </Alert>
            )}
            <JornadaForm
              key={selecionada?.id ?? "nova"}
              id={selecionada?.id}
              nome={selecionada?.nome}
              observacao={selecionada?.observacao}
              dias={selecionada?.dias ?? []}
              vinculados={selecionada?.funcionarioIds.length ?? 0}
            />
            {selecionada && selecionada.funcionarioIds.length > 0 && (() => {
              const ativos = selecionada.funcionarioIds
                .map((id) => nomePorId.get(id))
                .filter((n): n is string => Boolean(n))
                .sort((x, y) => x.localeCompare(y, "pt-BR"))
              const outros = selecionada.funcionarioIds.length - ativos.length
              return (
                <p className="text-muted-foreground text-xs">
                  Vinculados: {ativos.join(", ") || "nenhum ativo"}
                  {outros > 0 && ` (e ${outros === 1 ? "1 desligado" : `${outros} desligados`})`}.
                </p>
              )
            })()}
          </CardContent>
        </Card>
      )}

      <section className="grid gap-2">
        <h2 className="text-base font-semibold">Jornadas da entidade</h2>
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Jornada</TableHead>
                <TableHead className="hidden md:table-cell">Horário</TableHead>
                <TableHead className="text-right">Semana</TableHead>
                <TableHead className="text-right">Funcionários</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {jornadas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-28">
                    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                      <CalendarClock className="size-6" />
                      <p className="text-sm">
                        Nenhuma jornada configurada. Comece por{" "}
                        <Link className="underline" href="/painel/pessoal/atribuicoes/jornadas?nova=1">
                          Nova jornada
                        </Link>
                        .
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {jornadas.map((j) => (
                <TableRow key={j.id} data-state={j.id === selecionada?.id ? "selected" : undefined}>
                  <TableCell className="font-medium">
                    {j.nome}
                    {j.observacao && (
                      <span className="text-muted-foreground block text-xs font-normal">
                        {j.observacao}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell">
                    {resumoDias(j.dias) || "sem horários"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {j.minSemana > 0 ? formatarTempoMes(j.minSemana) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {j.funcionarioIds.length}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/painel/pessoal/atribuicoes/jornadas?jornada=${j.id}`}>
                        Editar
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="grid gap-2">
        <div>
          <h2 className="text-base font-semibold">Funcionários</h2>
          <p className="text-muted-foreground text-xs">
            {semJornada === 0
              ? "Todos os funcionários ativos têm jornada."
              : `${semJornada === 1 ? "1 funcionário ativo está" : `${semJornada} funcionários ativos estão`} sem jornada.`}
          </p>
        </div>
        {jornadas.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Crie uma jornada para poder vincular os funcionários.
          </p>
        ) : (
          <VincularJornadas
            jornadas={jornadas.map((j) => ({ id: j.id, nome: j.nome }))}
            linhas={linhas.map((l) => ({
              funcionarioId: l.funcionarioId,
              nome: l.nome,
              funcaoNome: l.funcaoNome,
              jornadaNome: l.jornadaNome,
              semana: l.minSemana > 0 ? formatarTempoMes(l.minSemana) : null,
            }))}
          />
        )}
      </section>
    </>
  )
}
