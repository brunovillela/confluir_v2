import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarFontesPagadoras } from "@/lib/db/fontes"

import { ImportarFiliados } from "./importar-filiados"

export const metadata: Metadata = { title: "Importar filiados — Confluir" }

export default async function ImportarPage() {
  await requirePermissao("filiacao_gestao")
  const fontes = await listarFontesPagadoras()
  const opcoes = fontes
    .filter((f) => f.inativa !== true)
    .map((f) => ({
      id: f.id,
      nome: f.nome_fantasia ?? f.nome_razao ?? "(sem nome)",
    }))

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/filiados">
            <ArrowLeft />
            Filiados
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Importar filiados em massa
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Sobe uma planilha CSV de filiados já vinculados a uma fonte pagadora.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Planilha de filiados</CardTitle>
        </CardHeader>
        <CardContent>
          <ImportarFiliados fontes={opcoes} />
        </CardContent>
      </Card>
    </>
  )
}
