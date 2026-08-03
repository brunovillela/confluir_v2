import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { opcoesFontes } from "@/lib/db/oposicao"

import { CampanhaForm } from "../oposicao-forms"

export const metadata: Metadata = { title: "Nova campanha — Confluir" }

export default async function NovaCampanhaPage() {
  await requirePermissao("oposicao")
  const fontes = await opcoesFontes()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao/oposicao">
            <ArrowLeft />
            Oposição
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nova campanha de oposição
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da campanha</CardTitle>
        </CardHeader>
        <CardContent>
          <CampanhaForm
            fontes={fontes}
            fonteIds={[]}
            aoCancelarHref="/painel/representacao/oposicao"
          />
        </CardContent>
      </Card>
    </>
  )
}
