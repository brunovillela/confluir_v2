import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { listarCentrosCusto } from "@/lib/db/financeiro"

import { CentroCustoForm } from "../centro-form"

export const metadata: Metadata = {
  title: "Novo centro de custo — Confluir",
}

export default async function NovoCentroCustoPage() {
  await requirePermissao("financeiro_pagamento", ["financeiro_caixa"])

  const todas = await listarCentrosCusto()
  const tipos = [
    ...new Set(
      todas.map((c) => c.tipo_da_conta).filter((v): v is string => Boolean(v))
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"))

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/financeiro/centros-custo">
            <ArrowLeft />
            Centros de custo
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Novo centro de custo
        </h1>
      </div>
      <CentroCustoForm tipos={tipos} />
    </>
  )
}
