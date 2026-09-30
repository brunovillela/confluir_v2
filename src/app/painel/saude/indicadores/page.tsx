import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { baseSaude } from "@/lib/db/saude-painel"

import { PainelSaude } from "./painel-saude"

export const metadata: Metadata = { title: "Painel analítico da Saúde — Confluir" }

export default async function IndicadoresSaudePage() {
  await requirePermissao("saude_cat", ["saude_gestao"])
  const base = await baseSaude()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2 print:hidden">
          <Link href="/painel/saude">
            <ArrowLeft />
            Saúde
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Painel analítico</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Acidentes de trabalho (CAT) por período, empresa, perfil do trabalhador e lesão — clique nos
          gráficos para cruzar os filtros
        </p>
      </div>
      {base && base.total > 0 ? (
        <PainelSaude base={base} />
      ) : (
        <Alert>
          <AlertDescription>Nenhuma CAT registrada ainda — o painel aparece quando houver dados.</AlertDescription>
        </Alert>
      )}
    </>
  )
}
