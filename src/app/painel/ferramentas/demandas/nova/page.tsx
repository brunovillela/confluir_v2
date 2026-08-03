import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarPessoasAtribuiveis } from "@/lib/db/nucleo"

import { criarDemandaAction } from "../actions"
import { DemandaForm } from "../demanda-form"

export const metadata: Metadata = { title: "Nova demanda — Confluir" }

export default async function NovaDemandaPage() {
  await requirePermissao("ferramentas_demandas")
  const pessoas = await listarPessoasAtribuiveis()

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/ferramentas/demandas">
            <ArrowLeft />
            Demandas
          </Link>
        </Button>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Nova demanda</h1>

      <Card>
        <CardContent className="pt-6">
          <DemandaForm action={criarDemandaAction} pessoas={pessoas} />
        </CardContent>
      </Card>
    </>
  )
}
