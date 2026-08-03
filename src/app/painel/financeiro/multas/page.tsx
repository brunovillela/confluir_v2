import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Receipt } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requirePermissao } from "@/lib/auth"
import { listarCobrancasPendentes, listarInfracoes } from "@/lib/db/veiculos"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"
import { ROTULOS_FORMA_COBRANCA } from "@/lib/veiculos-constantes"

import { BaixaCobrancaForm } from "./baixa-form"

export const metadata: Metadata = { title: "Cobranças de multas — Confluir" }

export default async function MultasPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("financeiro_pagamento")
  const { salvo } = await searchParams

  const [{ disponivel, cobrancas }, baixadas] = await Promise.all([
    listarCobrancasPendentes(),
    listarInfracoes({ cobranca: "baixada", limite: 100 }),
  ])

  const totalPendente = cobrancas.reduce(
    (s, c) => s + (c.cobranca_valor ?? c.custo ?? 0),
    0
  )

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/financeiro">
            <ArrowLeft />
            Financeiro
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Cobranças de multas de trânsito
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Valores a receber dos condutores infratores — a baixa fica registrada
          em histórico imutável para a auditoria do Conselho Fiscal
        </p>
      </div>

      {salvo && (
        <Alert variant="success">
          <AlertDescription>Baixa registrada.</AlertDescription>
        </Alert>
      )}
      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            Cobranças ainda não configuradas — rode{" "}
            <code>supabase/veiculos.sql</code> no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs">Cobranças pendentes</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {cobrancas.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs">Valor a receber</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {formatarMoeda(totalPendente)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent>
          <p className="mb-3 text-sm font-medium">Pendentes de baixa</p>
          {cobrancas.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              <Receipt className="mx-auto mb-2 size-5" />
              Nenhuma cobrança pendente.
            </p>
          ) : (
            <div className="grid gap-4">
              {cobrancas.map((c) => (
                <div key={c.id} className="rounded-lg border p-4">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium">
                      {c.condutorNome ?? "(condutor)"} —{" "}
                      {formatarMoeda(c.cobranca_valor ?? c.custo)} via{" "}
                      {c.cobranca_forma
                        ? ROTULOS_FORMA_COBRANCA[c.cobranca_forma]
                        : "forma não definida"}
                    </span>
                    <Link
                      href={`/painel/veiculos/infracoes/${c.id}`}
                      className="text-primary hover:underline"
                    >
                      Ver infração de {formatarData(c.infracao_data)}
                    </Link>
                  </div>
                  <p className="text-muted-foreground mb-3 text-sm">
                    {c.veiculoPlaca ?? ""} · {c.descricao ?? "—"}
                  </p>
                  <BaixaCobrancaForm
                    infracaoId={c.id}
                    valorTexto={formatarMoeda(c.cobranca_valor ?? c.custo)}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <GrupoColapsavel
        titulo="Histórico de baixas"
        descricao="Cobranças já recebidas — registro para o Conselho Fiscal"
        resumo={
          <span className="text-muted-foreground text-sm tabular-nums">
            {baixadas.length}
          </span>
        }
      >
        {baixadas.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma baixa registrada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Infração</TableHead>
                <TableHead>Condutor</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Baixa</TableHead>
                <TableHead>Registrada por</TableHead>
                <TableHead>Observação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {baixadas.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      href={`/painel/veiculos/infracoes/${c.id}`}
                      className="text-primary whitespace-nowrap hover:underline"
                    >
                      {formatarData(c.infracao_data)}
                      {c.veiculoPlaca ? ` · ${c.veiculoPlaca}` : ""}
                    </Link>
                  </TableCell>
                  <TableCell>{c.condutorNome ?? "—"}</TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatarMoeda(c.cobranca_valor ?? c.custo)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {c.baixa_em
                      ? formatarDataHora(c.baixa_em)
                      : "(reembolso legado)"}
                  </TableCell>
                  <TableCell>{c.baixaPorNome ?? "—"}</TableCell>
                  <TableCell className="max-w-72">
                    <span className="line-clamp-2">
                      {c.baixa_observacao ?? "—"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </GrupoColapsavel>
    </>
  )
}
