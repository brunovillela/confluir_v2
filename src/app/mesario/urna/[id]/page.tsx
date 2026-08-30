import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Box, Monitor, Search } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { operacaoUrna } from "@/lib/db/votacao-mesarios"

import { ListaPresenca, PareamentoTerminal, VotoEmSeparado } from "./operacao"

export const metadata: Metadata = { title: "Operar urna — Confluir" }

function fmtHorario(iso: string | null): string | null {
  return iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null
}

export default async function OperarUrnaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ busca?: string }>
}) {
  const { id } = await params
  const { busca } = await searchParams
  const dados = await operacaoUrna(id, busca ?? "")
  if (!dados) notFound()

  const ab = fmtHorario(dados.abertura)
  const fe = fmtHorario(dados.fechamento)

  return (
    <div className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/mesario">
            <ArrowLeft />
            Minhas urnas
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {dados.tipo === "digital" ? (
              <Monitor className="size-5" />
            ) : (
              <Box className="size-5" />
            )}
            {dados.nome ?? "Urna"}
          </h1>
          {dados.aberta ? (
            <Badge
              variant="outline"
              className="border-success/40 text-success-fg"
            >
              Aberta
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Fora do horário
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {dados.assembleiaNome ?? "Assembleia"}
          {ab || fe ? ` · ${ab ?? "…"} → ${fe ?? "…"}` : ""} ·{" "}
          {dados.compareceram.toLocaleString("pt-BR")} de{" "}
          {dados.totalAptos.toLocaleString("pt-BR")} compareceram
        </p>
      </div>

      {!dados.aberta && (
        <Alert variant="warning">
          <AlertDescription>
            Esta urna está fora do horário de votação. Você poderá registrar
            presenças apenas dentro da janela definida.
          </AlertDescription>
        </Alert>
      )}

      {dados.tipo === "digital" && !dados.terminalPareado && dados.aberta && (
        <PareamentoTerminal urnaId={dados.urnaId} />
      )}
      {dados.tipo === "digital" && dados.terminalPareado && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Terminal de votação pareado. Ao registrar a presença, a cédula abre
            no terminal para o eleitor votar.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Eleitores</CardTitle>
          <CardDescription>
            Busque pelo nome, CPF ou matrícula e registre a presença.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <form className="flex gap-2">
            <div className="relative flex-1 sm:max-w-sm">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
              <Input
                name="busca"
                defaultValue={busca ?? ""}
                placeholder="Nome, CPF ou matrícula"
                className="pl-8"
              />
            </div>
            <Button type="submit" variant="secondary">
              Buscar
            </Button>
          </form>
          <ListaPresenca
            urnaId={dados.urnaId}
            aberta={dados.aberta}
            aptos={dados.aptos}
          />
          <div className="border-t pt-3">
            <VotoEmSeparado urnaId={dados.urnaId} aberta={dados.aberta} />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
