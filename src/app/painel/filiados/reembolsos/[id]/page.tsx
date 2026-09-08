import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink } from "lucide-react"

import { SituacaoBadge } from "@/app/painel/financeiro/situacao-badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { obterReembolso } from "@/lib/db/filiacao-reembolsos-edicao"
import { listarProjetos } from "@/lib/db/projetos"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { ReembolsoForm } from "../reembolso-form"
import { ExcluirReembolso } from "./excluir-reembolso"

export const metadata: Metadata = { title: "Reembolso — Confluir" }

export default async function ReembolsoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("filiacao_reembolsos", ["filiacao_gestao"])
  const { id } = await params
  const { salvo } = await searchParams
  const [reembolso, projetos] = await Promise.all([
    obterReembolso(id),
    listarProjetos({ situacao: "todos" }),
  ])
  if (!reembolso) notFound()
  const ordem = reembolso.ordem
  const paga = ordem?.situacao === "Paga"

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/filiados/reembolsos">
            <ArrowLeft />
            Reembolsos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Reembolso a {reembolso.filiadoNome ?? "filiado"}
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {formatarData(reembolso.data)} · {formatarMoeda(reembolso.valor)}
        </p>
      </div>

      {salvo && (
        <Alert>
          <AlertDescription>Reembolso salvo.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ordem de pagamento</CardTitle>
          <CardDescription>
            O reembolso é pago pelo Financeiro. A situação abaixo é a da ordem.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ordem && !ordem.excluido ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <SituacaoBadge situacao={ordem.situacao} />
              <span className="font-medium tabular-nums">{ordem.codigo ?? "—"}</span>
              {paga && (
                <span className="text-muted-foreground">
                  paga em {formatarData(ordem.data_pagamento)} · {formatarMoeda(ordem.valor_pago)}
                </span>
              )}
              <Button asChild variant="outline" size="sm">
                <Link href={`/painel/financeiro/ordens/${ordem.id}`}>
                  <ExternalLink />
                  Abrir no Financeiro
                </Link>
              </Button>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {ordem?.excluido
                ? "A ordem deste reembolso foi excluída no Financeiro."
                : "Este reembolso veio do sistema antigo sem ordem de pagamento ligada."}
            </p>
          )}
        </CardContent>
      </Card>

      <ReembolsoForm
        projetos={projetos.map((p) => ({ id: p.id, titulo: p.titulo ?? "(sem título)" }))}
        valorPadrao={null}
        reembolso={reembolso}
        voltarPara="/painel/filiados/reembolsos"
      />

      <ExcluirReembolso
        reembolsoId={reembolso.id}
        filiadoId={reembolso.filiadoId}
        ordemCodigo={ordem?.codigo ?? null}
        paga={paga}
      />
    </>
  )
}
