import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { VoltarLista } from "@/components/voltar-lista"
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
      <RotuloTrilha
        valores={{
          historico: "Histórico",
          [id]: remessa.beneficiarioNome ?? "Remessa de diárias",
        }}
      />
      <div>
        <VoltarLista
          chave="diarias-historico"
          base="/painel/pessoal/diarias/historico"
          rotulo="Histórico de diárias"
          ancora={`registro-${id}`}
          className="-ml-2 mb-3"
        />
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
