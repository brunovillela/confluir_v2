import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  DadosRemessa,
  LancamentosRemessa,
  SituacaoRemessaBadge,
} from "@/components/diarias-historico"
import { requirePermissao } from "@/lib/auth"
import { obterRemessaDiaria } from "@/lib/db/diarias-historico"

export const metadata: Metadata = { title: "Remessa de diárias — Confluir" }

export default async function RemessaDiariaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_diarias"])
  const { id } = await params
  const dados = await obterRemessaDiaria(id)
  if (!dados) notFound()
  const { remessa, lancamentos } = dados

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/diarias/historico">
            <ArrowLeft />
            Histórico de diárias
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {remessa.beneficiarioNome ?? "Remessa de diárias"}
          </h1>
          <SituacaoRemessaBadge remessa={remessa} />
        </div>
        {remessa.codigo && (
          <p className="text-muted-foreground mt-1 text-xs tabular-nums">Remessa {remessa.codigo}</p>
        )}
      </div>

      <Card>
        <CardContent>
          <DadosRemessa remessa={remessa} linkOrdem />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Lançamentos <span className="text-muted-foreground font-normal">({lancamentos.length})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LancamentosRemessa lancamentos={lancamentos} />
        </CardContent>
      </Card>
    </>
  )
}
