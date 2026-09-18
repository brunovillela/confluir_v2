import type { Metadata } from "next"
import Link from "next/link"
import { Plus, ScrollText } from "lucide-react"

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
import { listarOficios, resumoOficios } from "@/lib/db/oficios"
import { escopoOficios } from "@/lib/db/oficios-acesso"
import { formatarData } from "@/lib/formato"
import {
  ROTULOS_TIPO_OFICIO,
  SITUACOES_OFICIO,
  type TipoOficio,
} from "@/lib/oficios-constantes"

export const metadata: Metadata = { title: "Ofícios — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const CLASSE_SITUACAO: Record<string, string> = {
  Rascunho: "border-warning/40 text-warning-fg",
  "Aguardando assinatura": "border-info/40 text-info-fg",
  Emitido: "border-success/40 text-success-fg",
  Cancelado: "text-muted-foreground line-through",
}

type Params = { situacao?: string; busca?: string; departamento?: string }

export default async function OficiosPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  await requirePermissao("ferramentas_oficios")

  const brutos = await searchParams
  const busca = (brutos.busca ?? "").trim()
  const situacao = (SITUACOES_OFICIO as readonly string[]).includes(
    brutos.situacao ?? ""
  )
    ? brutos.situacao
    : ""

  const escopo = await escopoOficios()
  const departamento =
    brutos.departamento === "sem" && escopo.todos
      ? "sem"
      : escopo.departamentos.some((d) => d.id === brutos.departamento)
        ? (brutos.departamento as string)
        : ""
  const [resumo, { disponivel, oficios }] = await Promise.all([
    resumoOficios(escopo).catch(() => null),
    listarOficios({ busca, situacao, departamentoId: departamento || undefined }, escopo),
  ])
  const nomeDepto = new Map(escopo.departamentos.map((d) => [d.id, d.nome]))
  const semDepartamento = !escopo.todos && escopo.departamentos.length === 0

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ofícios</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Emissão e histórico, com numeração contínua por ano
          </p>
        </div>
        {disponivel && (
          <Button asChild>
            <Link href="/painel/ferramentas/oficios/novo">
              <Plus />
              Novo ofício
            </Link>
          </Button>
        )}
      </div>

      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            Ofícios ainda não configurados — rode{" "}
            <code>supabase/oficios.sql</code> no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      )}

      {disponivel && semDepartamento && (
        <Alert variant="warning">
          <AlertDescription>
            Você não está em nenhum departamento, por isso não vê ofícios. Cada
            pessoa vê os ofícios dos seus departamentos — peça o vínculo em
            Institucional › Organização › Departamentos.
          </AlertDescription>
        </Alert>
      )}
      {disponivel && !semDepartamento && (
        <p className="text-muted-foreground -mt-2 text-xs">
          {escopo.todos
            ? "Você vê os ofícios de todos os departamentos."
            : `Você vê os ofícios de: ${escopo.departamentos.map((d) => d.nome).join(", ")}.`}
        </p>
      )}

      {disponivel && resumo && (
        <div className="grid gap-4 sm:grid-cols-3">
          <CardResumo rotulo="Ofícios" valor={resumo.total} />
          <CardResumo rotulo="Rascunhos" valor={resumo.rascunhos} />
          <CardResumo
            rotulo={`Emitidos em ${resumo.anoAtual}`}
            valor={resumo.emitidosAno}
          />
        </div>
      )}

      {disponivel && (
        <>
          <form
            className="flex flex-wrap items-center gap-2"
            action="/painel/ferramentas/oficios"
          >
            <input
              type="search"
              name="busca"
              defaultValue={busca}
              placeholder="Assunto"
              className={`${SELECT_FILTRO} w-64 max-w-full`}
            />
            {escopo.departamentos.length > 1 || escopo.todos ? (
              <select name="departamento" defaultValue={departamento} className={SELECT_FILTRO}>
                <option value="">Todos os departamentos</option>
                {escopo.departamentos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nome}
                  </option>
                ))}
                {escopo.todos && <option value="sem">Sem departamento</option>}
              </select>
            ) : null}
            <select name="situacao" defaultValue={situacao} className={SELECT_FILTRO}>
              <option value="">Todas as situações</option>
              {SITUACOES_OFICIO.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline" size="sm">
              Filtrar
            </Button>
          </form>

          <Card>
            <CardContent>
              {oficios.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center text-sm">
                  <ScrollText className="mx-auto mb-2 size-5" />
                  Nenhum ofício encontrado.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Número</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Assunto</TableHead>
                      <TableHead>Destinatário</TableHead>
                      <TableHead>Departamento</TableHead>
                      <TableHead>Data</TableHead>
                      <TableHead>Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {oficios.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          <Link
                            href={`/painel/ferramentas/oficios/${o.id}`}
                            className="text-primary font-medium hover:underline"
                          >
                            {o.numero != null ? `${o.numero}/${o.ano}` : o.situacao === "Rascunho" ? "— (rascunho)" : `s/nº ${o.ano ?? ""}`.trim()}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {o.tipo ? ROTULOS_TIPO_OFICIO[o.tipo as TipoOficio] ?? o.tipo : "—"}
                        </TableCell>
                        <TableCell className="max-w-72">
                          <span className="line-clamp-1">{o.assunto ?? "—"}</span>
                        </TableCell>
                        <TableCell className="max-w-48">
                          <span className="line-clamp-1">
                            {o.destinatarioNome ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-40 text-sm">
                          <span className="line-clamp-1">
                            {o.departamentoId ? (nomeDepto.get(o.departamentoId) ?? "—") : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {o.data ? formatarData(o.data) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={CLASSE_SITUACAO[o.situacao ?? ""] ?? ""}
                          >
                            {o.situacao ?? "—"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
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
