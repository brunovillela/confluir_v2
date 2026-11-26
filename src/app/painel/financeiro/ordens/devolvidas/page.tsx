import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CheckCircle2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { DIAS_DEVOLVIDA_ESQUECIDA, listarDevolvidasParadas } from "@/lib/db/ordens-devolvidas-paradas"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { CancelarDevolvida } from "./cancelar-devolvida"

export const metadata: Metadata = { title: "Ordens devolvidas — Confluir" }

/**
 * Triagem das ordens devolvidas (26/11/2026): todas as "Aguardando
 * informações", da mais antiga para a mais nova, com há quantos dias, o
 * motivo da devolução e quem lançou. Parada há mais de 30 dias: corrigir
 * (abrir a ordem ou a compra) ou cancelar com motivo.
 */
export default async function DevolvidasPage({ searchParams }: { searchParams: Promise<{ cancelada?: string }> }) {
  const { cancelada } = await searchParams
  const sessao = await requirePermissao("financeiro_pagamento", ["financeiro_leitura"])
  const podeCancelar = podeAcessar(sessao.permissoes, "financeiro_pagamento")
  const linhas = await listarDevolvidasParadas()
  const esquecidas = linhas.filter((l) => l.dias > DIAS_DEVOLVIDA_ESQUECIDA).length

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/financeiro">
            <ArrowLeft />
            Financeiro
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Ordens devolvidas</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Devolvidas pelo avaliador pedindo ajuste e ainda não corrigidas. Quem lançou é avisado e lembrado toda semana;
          parada há mais de {DIAS_DEVOLVIDA_ESQUECIDA} dias, decida: corrigir e reenviar, ou cancelar se não vai mais ser
          paga.
        </p>
      </div>

      {cancelada && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Ordem {cancelada.slice(0, 40)} cancelada — o motivo ficou na trilha dela.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {linhas.length} devolvida{linhas.length === 1 ? "" : "s"}
            {esquecidas > 0 && (
              <span className="text-warning-fg ml-2 text-sm font-normal">
                · {esquecidas} parada{esquecidas === 1 ? "" : "s"} há mais de {DIAS_DEVOLVIDA_ESQUECIDA} dias
              </span>
            )}
          </CardTitle>
          <CardDescription>Da mais antiga para a mais nova.</CardDescription>
        </CardHeader>
        <CardContent>
          {linhas.length === 0 ? (
            <p className="text-success-fg flex items-center justify-center gap-2 py-6 text-sm">
              <CheckCircle2 className="size-4" />
              Nenhuma ordem devolvida esperando correção.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Parada há</TableHead>
                    <TableHead>Ordem</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Motivo da devolução</TableHead>
                    <TableHead>Lançada por</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {linhas.map((l) => {
                    const esquecida = l.dias > DIAS_DEVOLVIDA_ESQUECIDA
                    return (
                      <TableRow key={l.id} className={esquecida ? "bg-warning/5" : undefined}>
                        <TableCell className="whitespace-nowrap">
                          <span className={esquecida ? "text-warning-fg font-semibold" : "font-medium"}>
                            {l.dias} dia{l.dias === 1 ? "" : "s"}
                          </span>
                          <span className="text-muted-foreground block text-xs">
                            desde {formatarData(l.devolvidaEm)}
                            {l.devolvidaPorNome ? ` · ${l.devolvidaPorNome}` : ""}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-72">
                          <Link
                            href={`/painel/financeiro/ordens/${l.id}`}
                            className="text-primary text-sm whitespace-nowrap tabular-nums hover:underline"
                          >
                            {l.codigo ?? "(sem código)"}
                          </Link>
                          {l.tipo && (
                            <Badge variant="outline" className="ml-2 text-xs">
                              {l.tipo}
                            </Badge>
                          )}
                          {l.descricao && (
                            <span className="text-muted-foreground line-clamp-1 text-xs" title={l.descricao}>
                              {l.descricao}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap tabular-nums">{formatarMoeda(l.valor)}</TableCell>
                        <TableCell className="max-w-64 text-sm">
                          <span className="line-clamp-2">{l.motivo ?? "—"}</span>
                        </TableCell>
                        <TableCell className="text-sm">{l.lancadaPorNome ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" asChild>
                              <Link href={l.processoId ? `/painel/compras/${l.processoId}#ordem-devolvida` : `/painel/financeiro/ordens/${l.id}`}>
                                Corrigir
                              </Link>
                            </Button>
                            {podeCancelar && <CancelarDevolvida id={l.id} codigo={l.codigo} />}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
