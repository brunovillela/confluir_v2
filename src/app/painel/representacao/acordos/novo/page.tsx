import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { opcoesFontes } from "@/lib/db/acordos"

import { AcordoForm } from "../acordos-forms"

export const metadata: Metadata = { title: "Novo acordo — Confluir" }

export default async function NovoAcordoPage() {
  await requirePermissao("acordos_coletivos")
  const fontes = await opcoesFontes()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao/acordos">
            <ArrowLeft />
            Acordos coletivos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Novo acordo coletivo
        </h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do acordo</CardTitle>
        </CardHeader>
        <CardContent>
          <AcordoForm
            fontes={fontes}
            fonteIds={[]}
            aoCancelarHref="/painel/representacao/acordos"
          />
        </CardContent>
      </Card>
    </>
  )
}
