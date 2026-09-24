import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Inbox } from "lucide-react"

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
import { listarEspacos } from "@/lib/db/espacos"
import {
  ROTULO_SITUACAO,
  listarSolicitacoes,
  type SituacaoSolicitacao,
} from "@/lib/db/espacos-esteira"
import { formatarDataHora } from "@/lib/formato"

export const metadata: Metadata = { title: "Pedidos de uso — Confluir" }

const SELECT =
  "border-input bg-background text-foreground h-9 max-w-56 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const COR: Record<SituacaoSolicitacao, string> = {
  rascunho: "text-muted-foreground",
  solicitada: "border-info/40 text-info-fg",
  em_analise: "border-warning/40 text-warning-fg",
  confirmada: "border-success/40 text-success-fg",
  recusada: "border-destructive/40 text-destructive",
  cancelada: "text-muted-foreground",
}

export default async function PedidosPage({
  searchParams,
}: {
  searchParams: Promise<{ situacao?: string; espaco?: string }>
}) {
  await requirePermissao("espacos", ["espacos_gestao"])
  const { situacao = "todas", espaco = "" } = await searchParams

  const [{ linhas, esquemaPronto }, espacos] = await Promise.all([
    listarSolicitacoes({ situacao, espacoId: espaco || undefined }),
    listarEspacos(),
  ])

  const naFila = linhas.filter((s) => s.situacao === "solicitada").length
  const emAnalise = linhas.filter((s) => s.situacao === "em_analise").length

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/painel/espacos" aria-label="Voltar para cessão de espaços">
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pedidos de uso</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            A fila da cessão: visita técnica, autorização e custeio
          </p>
        </div>
      </div>

      {!esquemaPronto && (
        <Alert variant="warning">
          <AlertDescription>
            Esteira ainda não configurada — rode{" "}
            <code>supabase/cessao-esteira.sql</code> no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      )}

      {esquemaPronto && (naFila > 0 || emAnalise > 0) && (
        <Alert variant="info">
          <AlertDescription>
            {naFila > 0 && (
              <>
                <strong>
                  {naFila} pedido{naFila === 1 ? "" : "s"} na fila
                </strong>
                {emAnalise > 0 && " · "}
              </>
            )}
            {emAnalise > 0 && (
              <>
                {emAnalise} em análise
              </>
            )}
            .
          </AlertDescription>
        </Alert>
      )}

      <form className="flex flex-wrap items-center gap-2" action="/painel/espacos/pedidos">
        <select name="situacao" defaultValue={situacao} className={SELECT}>
          <option value="todas">Todas as situações</option>
          {(
            ["solicitada", "em_analise", "confirmada", "recusada", "cancelada"] as const
          ).map((s) => (
            <option key={s} value={s}>
              {ROTULO_SITUACAO[s]}
            </option>
          ))}
        </select>
        {espacos.linhas.length > 0 && (
          <select name="espaco" defaultValue={espaco} className={SELECT}>
            <option value="">Todos os espaços</option>
            {espacos.linhas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </select>
        )}
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

      <Card>
        <CardContent>
          {linhas.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              <Inbox className="mx-auto mb-2 size-5" />
              Nenhum pedido com estes filtros.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Nº</TableHead>
                  <TableHead>Solicitante</TableHead>
                  <TableHead>Espaço</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead className="text-right">Público</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Com quem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="tabular-nums">
                      <Link
                        href={`/painel/espacos/pedidos/${s.id}`}
                        className="text-primary font-medium hover:underline"
                      >
                        {s.numero ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-64">
                      <span className="block truncate font-medium">
                        {s.solicitante}
                      </span>
                      {s.entidade && (
                        <span className="text-muted-foreground block truncate text-xs">
                          {s.entidade}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-48 truncate">{s.espacoNome}</TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatarDataHora(s.inicio)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {s.publicoEstimado ?? "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={COR[s.situacao]}>
                        {ROTULO_SITUACAO[s.situacao]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-40 truncate text-sm">
                      {s.analistaNome ?? "—"}
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
