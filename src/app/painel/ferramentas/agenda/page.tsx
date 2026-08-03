import type { Metadata } from "next"
import Link from "next/link"
import { CalendarDays } from "lucide-react"

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
import { listarEventos, resumoAgenda, TIPOS_AGENDA } from "@/lib/db/agenda"
import { formatarData, formatarDataHora } from "@/lib/formato"

export const metadata: Metadata = { title: "Agenda — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Params = { busca?: string; tipo?: string; quando?: string }

function periodoEvento(
  inicio: string | null,
  termino: string | null,
  diaTodo: boolean
): string {
  if (!inicio) return "—"
  if (diaTodo) return `${formatarData(inicio)} (dia todo)`
  const ini = formatarDataHora(inicio)
  if (!termino) return ini
  // Mesmo dia: mostra só o horário do término.
  const mesmoDia = inicio.slice(0, 10) === termino.slice(0, 10)
  return mesmoDia
    ? `${ini} – ${formatarDataHora(termino).split(" ").pop()}`
    : `${ini} – ${formatarDataHora(termino)}`
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  await requirePermissao("ferramentas_agendas")

  const brutos = await searchParams
  const busca = (brutos.busca ?? "").trim()
  const tipo = (TIPOS_AGENDA as readonly string[]).includes(brutos.tipo ?? "")
    ? brutos.tipo
    : ""
  const quando =
    brutos.quando === "futuros" || brutos.quando === "passados"
      ? brutos.quando
      : "todos"

  const [resumo, eventos] = await Promise.all([
    resumoAgenda(),
    listarEventos({ busca, tipo, quando }),
  ])

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Eventos, reuniões e atividades — {resumo.total.toLocaleString("pt-BR")}{" "}
          registros, {resumo.futuros} futuro(s)
        </p>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        action="/painel/ferramentas/agenda"
      >
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
        <select name="quando" defaultValue={quando} className={SELECT_FILTRO}>
          <option value="todos">Todo o período</option>
          <option value="futuros">Futuros</option>
          <option value="passados">Passados</option>
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

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
                      {periodoEvento(e.inicio, e.termino, e.diaTodo)}
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
