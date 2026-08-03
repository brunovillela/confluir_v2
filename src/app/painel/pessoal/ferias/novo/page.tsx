import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { funcionariosParaSelecao } from "@/lib/db/pessoal"

import { PeriodoFeriasForm } from "../periodo-form"

export const metadata: Metadata = {
  title: "Novo período de férias — Confluir",
}

export default async function NovoPeriodoFeriasPage() {
  await requirePermissao("pessoal_gestao")

  const funcionarios = await funcionariosParaSelecao()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/ferias">
            <ArrowLeft />
            Férias
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Novo período de férias
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Período aquisitivo de 1 ano; os gozos acontecem no concessivo (os 12
          meses seguintes).
        </p>
      </div>
      <PeriodoFeriasForm funcionarios={funcionarios} />
    </>
  )
}
