import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Handshake, Lock, Plus } from "lucide-react"

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
import { ROTULO_TIPO } from "@/lib/acordos-constantes"
import { requirePermissao } from "@/lib/auth"
import { AVISO_SQL_NEGOCIACOES, listarNegociacoes } from "@/lib/db/negociacoes"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { ROTULO_SITUACAO_NEGOCIACAO } from "@/lib/negociacoes-constantes"

export const metadata: Metadata = { title: "Negociações sindicais — Confluir" }

export default async function NegociacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ excluida?: string }>
}) {
  await requirePermissao("negociacoes")
  const sp = await searchParams
  const { disponivel, lista } = await listarNegociacoes()

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
          <h1 className="text-2xl font-semibold tracking-tight">Negociações sindicais</h1>
          <Button asChild>
            <Link href="/painel/representacao/negociacoes/nova">
              <Plus />
              Nova negociação
            </Link>
          </Button>
        </div>
        <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
          <Lock className="size-3.5" />
          Área sigilosa: pauta, propostas por rodada e o quadro vigente × pauta × proposta só aparecem para quem
          negocia.
        </p>
      </div>

      {sp.excluida === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Negociação excluída.</AlertDescription>
        </Alert>
      )}
      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>{AVISO_SQL_NEGOCIACOES}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          {lista.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <Handshake className="mx-auto mb-2 size-5" />
              Nenhuma negociação ainda.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Negociação</TableHead>
                  <TableHead>Empresas</TableHead>
                  <TableHead>Data-base</TableHead>
                  <TableHead>Documentos</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Atualizada</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="max-w-72">
                      <Link
                        href={`/painel/representacao/negociacoes/${n.id}`}
                        className="text-primary line-clamp-1 font-medium hover:underline"
                      >
                        {n.titulo}
                      </Link>
                      <span className="text-muted-foreground text-xs">
                        {ROTULO_TIPO[n.tipo]}
                        {n.inicio ? ` · desde ${formatarData(n.inicio)}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-48">
                      <span className="line-clamp-2 text-sm">{n.empresas.join(", ") || "—"}</span>
                    </TableCell>
                    <TableCell>{n.dataBase ?? "—"}</TableCell>
                    <TableCell className="tabular-nums">{n.documentos}</TableCell>
                    <TableCell>
                      <Badge variant={n.situacao === "em_curso" ? "default" : "outline"}>
                        {ROTULO_SITUACAO_NEGOCIACAO[n.situacao]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">{formatarDataHora(n.atualizadaEm)}</TableCell>
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
