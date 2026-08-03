import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, FileSignature, Plus, TriangleAlert } from "lucide-react"

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
import { acordosVencendo, listarAcordos } from "@/lib/db/acordos"
import { formatarData } from "@/lib/formato"
import {
  DIAS_ALERTA_ACORDO,
  estadoVigencia,
  ROTULO_TIPO,
  SITUACOES_ACORDO,
  TIPOS_ACORDO,
  type EstadoVigencia,
  type SituacaoAcordo,
  type TipoAcordo,
} from "@/lib/acordos-constantes"

export const metadata: Metadata = { title: "Acordos coletivos — Confluir" }

const SELECT =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const ROTULO_SITUACAO: Record<SituacaoAcordo, string> = {
  em_negociacao: "Em negociação",
  vigente: "Vigente",
  arquivado: "Arquivado",
}

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())
}

function BadgeVigencia({ estado }: { estado: EstadoVigencia }) {
  if (estado === "vencido")
    return <Badge variant="destructive">Vencido</Badge>
  if (estado === "vencendo")
    return <Badge variant="warning">Vencendo</Badge>
  return null
}

export default async function AcordosPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; situacao?: string; busca?: string }>
}) {
  await requirePermissao("acordos_coletivos")
  const brutos = await searchParams

  const tipo = TIPOS_ACORDO.some((t) => t.chave === brutos.tipo)
    ? (brutos.tipo as TipoAcordo)
    : "todos"
  const situacao = SITUACOES_ACORDO.some((s) => s.chave === brutos.situacao)
    ? (brutos.situacao as SituacaoAcordo)
    : "todas"
  const busca = (brutos.busca ?? "").trim()

  const [acordos, vencendo] = await Promise.all([
    listarAcordos({ tipo, situacao, busca }),
    acordosVencendo(DIAS_ALERTA_ACORDO),
  ])
  const hoje = hojeSP()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao">
            <ArrowLeft />
            Representação
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Acordos coletivos
          </h1>
          <Button asChild>
            <Link href="/painel/representacao/acordos/novo">
              <Plus />
              Novo acordo
            </Link>
          </Button>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          ACT e CCT: vigência, abrangência, cláusulas e alertas de vencimento.
        </p>
      </div>

      {vencendo.length > 0 && (
        <Card className="border-warning/40">
          <CardContent className="py-4">
            <p className="text-warning-fg flex items-center gap-2 text-sm font-medium">
              <TriangleAlert className="size-4" />
              {vencendo.length} acordo(s) vigente(s) vencendo em até{" "}
              {DIAS_ALERTA_ACORDO} dias ou já vencido(s)
            </p>
            <ul className="mt-2 grid gap-1 text-sm">
              {vencendo.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/painel/representacao/acordos/${a.id}`}
                    className="text-primary hover:underline"
                  >
                    {a.titulo ?? "(sem título)"}
                  </Link>{" "}
                  <span className="text-muted-foreground">
                    — vence {formatarData(a.vigencia_fim)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <form className="flex flex-wrap items-center gap-2" action="/painel/representacao/acordos">
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Título ou abrangência"
          className={`${SELECT} w-64 max-w-full`}
        />
        <select name="tipo" defaultValue={tipo} className={SELECT}>
          <option value="todos">Todos os tipos</option>
          {TIPOS_ACORDO.map((t) => (
            <option key={t.chave} value={t.chave}>
              {t.rotulo}
            </option>
          ))}
        </select>
        <select name="situacao" defaultValue={situacao} className={SELECT}>
          <option value="todas">Todas as situações</option>
          {SITUACOES_ACORDO.map((s) => (
            <option key={s.chave} value={s.chave}>
              {s.rotulo}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

      <Card>
        <CardContent>
          {acordos.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <FileSignature className="mx-auto mb-2 size-5" />
              Nenhum acordo com estes filtros.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Título</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Fontes</TableHead>
                  <TableHead>Vigência</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {acordos.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="max-w-72">
                      <Link
                        href={`/painel/representacao/acordos/${a.id}`}
                        className="text-primary line-clamp-1 font-medium hover:underline"
                      >
                        {a.titulo ?? "(sem título)"}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ROTULO_TIPO[a.tipo]}</Badge>
                    </TableCell>
                    <TableCell className="max-w-40">
                      <span className="line-clamp-1 text-sm">
                        {a.fontes.join(", ") || "—"}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatarData(a.vigencia_inicio)} –{" "}
                      {a.vigencia_fim ? formatarData(a.vigencia_fim) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">
                          {ROTULO_SITUACAO[a.situacao]}
                        </span>
                        {a.situacao === "vigente" && (
                          <BadgeVigencia
                            estado={estadoVigencia(a.vigencia_fim, hoje)}
                          />
                        )}
                      </div>
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
