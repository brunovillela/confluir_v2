import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { CalendarDays, ExternalLink, Pencil, Plus } from "lucide-react"

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
import {
  COOKIE_VISAO_AGENDA,
  diasDaVisao,
  ehDia,
  ehVisaoAgenda,
  limitesDaConsulta,
  rotuloPeriodo,
  type VisaoAgenda,
} from "@/lib/agenda-calendario"
import { requirePermissao } from "@/lib/auth"
import {
  listarEventos,
  listarEventosDoPeriodo,
  resumoAgenda,
  TIPOS_AGENDA,
} from "@/lib/db/agenda"
import { hojeSP } from "@/lib/db/comum"
import { podeAcessar } from "@/lib/permissoes"

import { ExcluirCompromissoBotao } from "./agenda-forms"
import { AlternarVisao, Calendario } from "./calendario"

export const metadata: Metadata = { title: "Agenda — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Params = {
  busca?: string
  tipo?: string
  quando?: string
  excluido?: string
  visao?: string
  data?: string
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const sessao = await requirePermissao("ferramentas_agendas", ["ferramentas_agendas_edicao"])
  const podeCriar = podeAcessar(sessao.permissoes, "ferramentas_agendas_edicao")

  const brutos = await searchParams
  const busca = (brutos.busca ?? "").trim()
  const tipo = (TIPOS_AGENDA as readonly string[]).includes(brutos.tipo ?? "")
    ? brutos.tipo
    : ""
  const quando =
    brutos.quando === "futuros" || brutos.quando === "passados"
      ? brutos.quando
      : "todos"

  // Sem visão na URL, vale a última usada (ao voltar de um compromisso, por exemplo).
  const lembrada = (await cookies()).get(COOKIE_VISAO_AGENDA)?.value
  const visao: VisaoAgenda = ehVisaoAgenda(brutos.visao)
    ? brutos.visao
    : ehVisaoAgenda(lembrada)
      ? lembrada
      : "lista"
  const hoje = hojeSP()
  const dia = ehDia(brutos.data) ? brutos.data : hoje
  const dias = visao === "lista" ? [] : diasDaVisao(visao, dia)
  const periodo = visao === "lista" ? null : limitesDaConsulta(dias)

  const [resumo, eventos] = await Promise.all([
    resumoAgenda(),
    periodo
      ? listarEventosDoPeriodo(periodo.de, periodo.ate, { busca, tipo })
      : listarEventos({ busca, tipo, quando }),
  ])

  // O que a navegação e a troca de visão preservam da URL.
  const filtros = new URLSearchParams()
  if (busca) filtros.set("busca", busca)
  if (tipo) filtros.set("tipo", tipo)
  const paraTrocarVisao = new URLSearchParams(filtros)
  if (ehDia(brutos.data)) paraTrocarVisao.set("data", brutos.data)

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Eventos, reuniões e atividades — {resumo.total.toLocaleString("pt-BR")}{" "}
            registros, {resumo.futuros} futuro(s)
          </p>
        </div>
        {podeCriar && (
          <Button asChild>
            <Link href="/painel/ferramentas/agenda/novo">
              <Plus />
              Novo compromisso
            </Link>
          </Button>
        )}
      </div>

      {brutos.excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Compromisso excluído.</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
      <form
        className="flex flex-wrap items-center gap-2"
        action="/painel/ferramentas/agenda"
      >
        <input type="hidden" name="visao" value={visao} />
        {visao !== "lista" && <input type="hidden" name="data" value={dia} />}
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Atividade"
          className={`${SELECT_FILTRO} w-64 max-w-full`}
        />
        <select name="tipo" defaultValue={tipo} className={SELECT_FILTRO}>
          <option value="">Todos os tipos</option>
          {TIPOS_AGENDA.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {visao === "lista" && (
          <select name="quando" defaultValue={quando} className={SELECT_FILTRO}>
            <option value="todos">Todo o período</option>
            <option value="futuros">Futuros</option>
            <option value="passados">Passados</option>
          </select>
        )}
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>
      <AlternarVisao atual={visao} consulta={paraTrocarVisao.toString()} />
      </div>

      {visao !== "lista" ? (
        <Calendario
          visao={visao}
          dia={dia}
          dias={dias}
          hoje={hoje}
          eventos={eventos}
          podeCriar={podeCriar}
          consulta={filtros.toString()}
        />
      ) : (
      <Card>
        <CardContent>
          {eventos.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <CalendarDays className="mx-auto mb-2 size-5" />
              Nenhum evento encontrado com estes filtros.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Atividade</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Local / Sede</TableHead>
                  <TableHead>Departamento</TableHead>
                  {podeCriar && <TableHead className="w-24 text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventos.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="max-w-80">
                      <Link
                        href={`/painel/ferramentas/agenda/${e.id}`}
                        className="text-primary font-medium hover:underline"
                      >
                        <span className="line-clamp-2">
                          {e.atividade ?? "(sem título)"}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {rotuloPeriodo(e)}
                    </TableCell>
                    <TableCell>
                      {e.tipo ? (
                        <Badge variant="outline" className="whitespace-nowrap">
                          {e.tipo}
                        </Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="max-w-56">
                      <span className="line-clamp-1">
                        {e.local ?? e.sedeNome ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-48">
                      <span className="line-clamp-1">
                        {e.departamentoNome ?? "—"}
                      </span>
                    </TableCell>
                    {podeCriar && (
                      <TableCell className="text-right whitespace-nowrap">
                        {e.origem === "avulso" ? (
                          <span className="inline-flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" asChild title="Editar" aria-label="Editar">
                              <Link href={`/painel/ferramentas/agenda/${e.id}?editar=1`}>
                                <Pencil />
                              </Link>
                            </Button>
                            <ExcluirCompromissoBotao id={e.id} compacto />
                          </span>
                        ) : (
                          e.linkOrigem && (
                            <Button
                              variant="ghost"
                              size="icon"
                              asChild
                              title={e.origem === "evento" ? "Editar em Eventos" : "Editar em Votações"}
                              aria-label={e.origem === "evento" ? "Editar em Eventos" : "Editar em Votações"}
                            >
                              <Link href={e.linkOrigem}>
                                <ExternalLink />
                              </Link>
                            </Button>
                          )
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      )}
    </>
  )
}
