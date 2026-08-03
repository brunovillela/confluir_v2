import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarDays } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { obterEvento } from "@/lib/db/agenda"
import { formatarData, formatarDataHora } from "@/lib/formato"

export const metadata: Metadata = { title: "Evento — Confluir" }

export default async function EventoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("ferramentas_agendas")
  const { id } = await params

  const e = await obterEvento(id)
  if (!e) notFound()

  const quando = !e.inicio
    ? "—"
    : e.diaTodo
      ? `${formatarData(e.inicio)} (dia todo)`
      : `${formatarDataHora(e.inicio)}${e.termino ? ` – ${formatarDataHora(e.termino)}` : ""}`

  const campos: { rotulo: string; valor: string | null }[] = [
    { rotulo: "Quando", valor: quando },
    { rotulo: "Local", valor: e.local },
    { rotulo: "Sede", valor: e.sedeNome },
    { rotulo: "Departamento", valor: e.departamentoNome },
  ]

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/ferramentas/agenda">
            <ArrowLeft />
            Agenda
          </Link>
        </Button>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <CalendarDays className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">
            {e.atividade ?? "(sem título)"}
          </h1>
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {e.tipo && <Badge variant="outline">{e.tipo}</Badge>}
          {e.eventoInterno && <Badge variant="secondary">Interno</Badge>}
          {e.aplicativo && <Badge variant="secondary">No aplicativo</Badge>}
        </div>
      </div>

      <Card>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          {campos.map((c) => (
            <div key={c.rotulo}>
              <p className="text-muted-foreground text-xs">{c.rotulo}</p>
              <p className="mt-0.5">{c.valor ?? "—"}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {e.informacoesGerais && (
        <Card>
          <CardContent>
            <p className="text-muted-foreground mb-2 text-xs">
              Informações gerais
            </p>
            <p className="text-sm whitespace-pre-wrap">{e.informacoesGerais}</p>
          </CardContent>
        </Card>
      )}
    </>
  )
}
