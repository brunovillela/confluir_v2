import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Plus, ScrollText } from "lucide-react"

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
import { listarAtas, opcoesMandatos } from "@/lib/db/atas"
import { formatarData } from "@/lib/formato"
import {
  ROTULO_TIPO_REUNIAO,
  TIPOS_REUNIAO,
  type TipoReuniao,
} from "@/lib/atas-constantes"

export const metadata: Metadata = { title: "Atas de reunião — Confluir" }

const SELECT =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export default async function AtasPage({
  searchParams,
}: {
  searchParams: Promise<{
    tipo?: string
    mandato?: string
    busca?: string
    excluida?: string
  }>
}) {
  await requirePermissao("diretoria_reunioes")
  const brutos = await searchParams

  const tipo = TIPOS_REUNIAO.some((t) => t.chave === brutos.tipo)
    ? (brutos.tipo as TipoReuniao)
    : "todos"
  const mandatoId = brutos.mandato ?? ""
  const busca = (brutos.busca ?? "").trim()

  const [atas, mandatos] = await Promise.all([
    listarAtas({ tipo, mandatoId: mandatoId || undefined, busca }),
    opcoesMandatos(),
  ])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional">
            <ArrowLeft />
            Institucional
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Atas de reunião
          </h1>
          <Button asChild>
            <Link href="/painel/institucional/atas/novo">
              <Plus />
              Nova ata
            </Link>
          </Button>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Reuniões da entidade (diretoria, conselho, assembleia), com PDF da ata.
        </p>
      </div>

      {brutos.excluida === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Ata excluída.</AlertDescription>
        </Alert>
      )}

      <form
        className="flex flex-wrap items-center gap-2"
        action="/painel/institucional/atas"
      >
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Título ou órgão"
          className={`${SELECT} w-64 max-w-full`}
        />
        <select name="tipo" defaultValue={tipo} className={SELECT}>
          <option value="todos">Todos os tipos</option>
          {TIPOS_REUNIAO.map((t) => (
            <option key={t.chave} value={t.chave}>
              {t.rotulo}
            </option>
          ))}
        </select>
        <select name="mandato" defaultValue={mandatoId} className={SELECT}>
          <option value="">Todos os mandatos</option>
          {mandatos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nome}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

      <Card>
        <CardContent>
          {atas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <ScrollText className="mx-auto mb-2 size-5" />
              Nenhuma ata com estes filtros.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Mandato</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {atas.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="whitespace-nowrap text-sm">
                      {a.data ? formatarData(a.data) : "—"}
                    </TableCell>
                    <TableCell className="max-w-72">
                      <Link
                        href={`/painel/institucional/atas/${a.id}`}
                        className="text-primary line-clamp-1 font-medium hover:underline"
                      >
                        {a.titulo ?? "(sem título)"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {ROTULO_TIPO_REUNIAO[a.tipo]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {a.mandatoNome ?? "—"}
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
