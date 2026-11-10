import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Pencil } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarFuncionarios } from "@/lib/db/pessoal"
import { listarJornadas, listarJornadasModelo } from "@/lib/db/pessoal-sst"
import {
  DIAS_SEMANA,
  formatarHora,
  formatarTempoMes,
  intervaloDoDiaJornada,
  minutosDoDiaJornada,
} from "@/lib/pessoal-sst-constantes"

import { ExcluirJornada, JornadaForm } from "../jornada-form"
import { VincularJornadas, type LinhaVinculo } from "../vincular-form"

export const metadata: Metadata = { title: "Jornada de trabalho — Confluir" }

/**
 * Uma jornada da entidade: o horário de cada dia (com o intervalo entre os
 * turnos), quem a segue (para mover ou tirar) e quem pode ser incluído. A
 * edição abre aqui mesmo (?editar=1) e fecha ao salvar.
 */
export default async function JornadaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ editar?: string; salva?: string; criada?: string }>
}) {
  await requirePermissao("pessoal_gestao")
  const { id } = await params
  const { editar, salva, criada } = await searchParams

  const [jornadas, funcionarios] = await Promise.all([
    listarJornadasModelo(),
    listarFuncionarios({ situacao: "ativos" }),
  ])
  const jornada = jornadas.find((j) => j.id === id)
  if (!jornada) notFound()
  const linhas = await listarJornadas(
    funcionarios.linhas.map((l) => ({ usuarioId: l.usuarioId, nome: l.nome }))
  )
  const base = `/painel/pessoal/atribuicoes/jornadas/${id}`
  const editando = editar === "1"

  const paraLinha = (l: (typeof linhas)[number]): LinhaVinculo => ({
    funcionarioId: l.funcionarioId,
    nome: l.nome,
    funcaoNome: l.funcaoNome,
    jornadaNome: l.jornadaNome,
    semana: l.minSemana > 0 ? formatarTempoMes(l.minSemana) : null,
  })
  const nesta = linhas.filter((l) => l.jornadaId === id)
  const outros = linhas.filter((l) => l.jornadaId !== id)
  // Vinculados que não estão entre os ativos (desligados): só contados.
  const desligados = jornada.funcionarioIds.length - nesta.length
  const porDia = new Map(jornada.dias.map((d) => [d.dia_semana, d]))
  const outrasJornadas = jornadas.filter((j) => j.id !== id).map((j) => ({ id: j.id, nome: j.nome }))

  return (
    <>
      <RotuloTrilha valores={{ [id]: jornada.nome }} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
            <Link href={`/painel/pessoal/atribuicoes/jornadas#jornada-${id}`}>
              <ArrowLeft />
              Jornadas de trabalho
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">{jornada.nome}</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {jornada.minSemana > 0
              ? `${formatarTempoMes(jornada.minSemana)} por semana (~${formatarTempoMes(jornada.minMes)}/mês)`
              : "Sem horários"}
            {" · "}
            {nesta.length === 1 ? "1 funcionário" : `${nesta.length} funcionários`}
            {desligados > 0 && ` (e ${desligados === 1 ? "1 desligado" : `${desligados} desligados`})`}
            {jornada.observacao && ` · ${jornada.observacao}`}
          </p>
        </div>
        {!editando && (
          <div className="flex flex-wrap items-start gap-2">
            <Button asChild>
              <Link href={`${base}?editar=1`}>
                <Pencil />
                Editar jornada
              </Link>
            </Button>
            {jornada.funcionarioIds.length === 0 && <ExcluirJornada id={id} />}
          </div>
        )}
      </div>

      {(salva || criada) && !editando && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            {criada
              ? "Jornada criada. Inclua abaixo os funcionários que a seguem."
              : `Jornada salva.${nesta.length > 0 ? ` Vale para ${nesta.length === 1 ? "1 funcionário" : `${nesta.length} funcionários`} e entra no movimento da folha.` : ""}`}
          </AlertDescription>
        </Alert>
      )}

      {editando ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Editar jornada</CardTitle>
          </CardHeader>
          <CardContent>
            <JornadaForm
              id={id}
              nome={jornada.nome}
              observacao={jornada.observacao}
              dias={jornada.dias}
              vinculados={jornada.funcionarioIds.length}
              cancelarHref={base}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Horário</CardTitle>
            <CardDescription>
              O alerta de acesso fora do horário vale antes da primeira entrada e depois da última saída
              de cada dia; o intervalo entre os turnos não conta como fora.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Dia</TableHead>
                    <TableHead>1º turno</TableHead>
                    <TableHead>Intervalo</TableHead>
                    <TableHead>2º turno</TableHead>
                    <TableHead className="text-right">No dia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {DIAS_SEMANA.map((ds) => {
                    const d = porDia.get(ds.valor)
                    const intervalo = d ? intervaloDoDiaJornada(d) : 0
                    return (
                      <TableRow key={ds.valor} className={d ? "" : "text-muted-foreground"}>
                        <TableCell>{ds.rotulo}</TableCell>
                        <TableCell className="tabular-nums">
                          {d ? `${formatarHora(d.hora_inicio)} às ${formatarHora(d.hora_fim)}` : "sem expediente"}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">
                          {intervalo > 0 ? formatarTempoMes(intervalo) : "—"}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {d?.hora_inicio_2 && d.hora_fim_2
                            ? `${formatarHora(d.hora_inicio_2)} às ${formatarHora(d.hora_fim_2)}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d ? formatarTempoMes(minutosDoDiaJornada(d)) : "—"}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <section className="grid gap-2">
        <div>
          <h2 className="text-base font-semibold">Funcionários nesta jornada</h2>
          <p className="text-muted-foreground text-xs">
            Para mudar alguém de jornada, marque e escolha a outra (ou Sem jornada).
          </p>
        </div>
        <VincularJornadas
          linhas={nesta.map(paraLinha)}
          jornadas={outrasJornadas}
          convite="Marque e escolha para onde vão:"
          botao="Mover"
          vazio="Ninguém segue esta jornada ainda."
        />
      </section>

      <section className="grid gap-2">
        <div>
          <h2 className="text-base font-semibold">Incluir funcionários</h2>
          <p className="text-muted-foreground text-xs">
            Funcionários ativos em outra jornada ou sem jornada. Incluir aqui tira da jornada atual.
          </p>
        </div>
        <VincularJornadas
          linhas={outros.map(paraLinha)}
          jornadas={[{ id, nome: jornada.nome }]}
          semJornada={false}
          convite="Marque quem passa a seguir esta jornada:"
          botao="Incluir nesta jornada"
          vazio="Todos os funcionários ativos já seguem esta jornada."
        />
      </section>
    </>
  )
}
