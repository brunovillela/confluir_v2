import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"

import { ConvidadoForm } from "../convidado-form"

export const metadata: Metadata = { title: "Novo convidado — Confluir" }

export default async function NovoConvidadoPage() {
  await requirePermissao("custeio_institucional_edicao")
  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional/custeios/convidados">
            <ArrowLeft />
            Convidados
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Novo convidado</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do convidado</CardTitle>
        </CardHeader>
        <CardContent>
          <ConvidadoForm aoCancelarHref="/painel/institucional/custeios/convidados" />
        </CardContent>
      </Card>
    </>
  )
}
