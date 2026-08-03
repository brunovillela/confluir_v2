import type { Metadata } from "next"
import Link from "next/link"
import {
  CalendarDays,
  CircleCheck,
  Plus,
  TriangleAlert,
  Video,
} from "lucide-react"

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
import {
  listarAgenda,
  listarAssistidos,
  listarProfissionais,
} from "@/lib/db/atendimentos"
import { formatarData } from "@/lib/formato"

import { AgendamentoForm, ExcluirAgendamentoForm } from "./agenda-forms"

export const metadata: Metadata = { title: "Agenda de saúde — Confluir" }

const CAMPO =
  "border-input bg-background text-foreground h-9 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export default async function AgendaSaudePage({
  searchParams,
}: {
  searchParams: Promise<{
    de?: string
    ate?: string
    editar?: string
    salvo?: string
    excluido?: string
  }>
}) {
  await requirePermissao("saude_atendimento", ["saude_gestao"])

  const p = await searchParams
  const hoje = new Date().toISOString().slice(0, 10)
  // Por padrão mostra de hoje em diante — agenda serve para o que vem.
  const de = p.de ?? hoje
  const ate = p.ate ?? ""

  const [{ linhas, disponivel }, { linhas: assistidos }, { linhas: profissionais }] =
    await Promise.all([
      listarAgenda({ de: de || undefined, ate: ate || undefined }),
      listarAssistidos(),
      listarProfissionais(),
    ])

  const emEdicao = linhas.find((a) => a.id === p.editar)

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Agenda de saúde
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Atendimentos agendados
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/painel/saude">Voltar ao módulo</Link>
        </Button>
      </div>

      {!disponivel && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>
            Atendimentos ainda não configurados — rode{" "}
            <code>supabase/saude-atendimentos.sql</code>.
          </AlertDescription>
        </Alert>
      )}

      {(p.salvo || p.excluido) && (
        <Alert variant="success">
          <CircleCheck />
          <AlertDescription>
            {p.salvo ? "Agendamento salvo." : "Agendamento excluído."}
          </AlertDescription>
        </Alert>
      )}

      <form className="flex flex-wrap items-end gap-2" action="/painel/saude/agenda">
        <div className="grid gap-1">
          <label htmlFor="de" className="text-muted-foreground text-xs">
            De
          </label>
          <input id="de" type="date" name="de" defaultValue={de} className={CAMPO} />
        </div>
        <div className="grid gap-1">
          <label htmlFor="ate" className="text-muted-foreground text-xs">
            Até
          </label>
          <input id="ate" type="date" name="ate" defaultValue={ate} className={CAMPO} />
        </div>
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/saude/agenda?de=">Todos os períodos</Link>
        </Button>
      </form>

      <Card>
        <CardContent>
          {linhas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <CalendarDays className="mx-auto mb-2 size-5" />
              Nenhum agendamento no período.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Assistido</TableHead>
                  <TableHead>Profissional</TableHead>
                  <TableHead>Modalidade</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="w-32"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatarData(a.inicio)}
                      {a.termino && a.termino !== a.inicio && (
                        <span className="text-muted-foreground">
                          {" "}
                          a {formatarData(a.termino)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      {a.assistidoNome ?? "—"}
                    </TableCell>
                    <TableCell>{a.profissionalNome ?? "—"}</TableCell>
                    <TableCell>
                      {a.online ? (
                        <Badge variant="outline">
                          <Video className="size-3" />
                          Online
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          presencial
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {a.atendido ? (
                        <Badge variant="success">Atendido</Badge>
                      ) : a.inicio && a.inicio < hoje ? (
                        <Badge variant="warning">Sem registro</Badge>
                      ) : (
                        <Badge variant="outline">Agendado</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {!a.atendido && a.assistido_id && (
                          <Button variant="ghost" size="sm" asChild>
                            <Link
                              href={`/painel/saude/atendimentos/novo?assistido=${a.assistido_id}`}
                            >
                              Registrar
                            </Link>
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" asChild>
                          <Link
                            href={
                              emEdicao?.id === a.id
                                ? "/painel/saude/agenda"
                                : `/painel/saude/agenda?editar=${a.id}`
                            }
                          >
                            {emEdicao?.id === a.id ? "Cancelar" : "Editar"}
                          </Link>
                        </Button>
                        <ExcluirAgendamentoForm id={a.id} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Plus className="text-muted-foreground size-4" />
            {emEdicao ? "Editar agendamento" : "Novo agendamento"}
          </p>
          <AgendamentoForm
            agendamento={emEdicao}
            assistidos={assistidos.map((a) => ({
              id: a.id,
              nome: a.nome ?? "(sem nome)",
            }))}
            profissionais={profissionais}
          />
        </CardContent>
      </Card>
    </>
  )
}
