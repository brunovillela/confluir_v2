import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarPessoasAtribuiveis } from "@/lib/db/nucleo"

import { criarAnomaliaAction } from "../actions"
import { AnomaliaForm } from "../anomalia-form"

export const metadata: Metadata = { title: "Nova anomalia — Confluir" }

export default async function NovaAnomaliaPage() {
  await requirePermissao("ferramentas_anomalias")
  const pessoas = await listarPessoasAtribuiveis()

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/ferramentas/anomalias">
            <ArrowLeft />
            Anomalias
          </Link>
        </Button>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Nova anomalia</h1>

      <Card>
        <CardContent className="pt-6">
          <AnomaliaForm action={criarAnomaliaAction} pessoas={pessoas} />
        </CardContent>
      </Card>
    </>
  )
}
