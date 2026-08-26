import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { buscarConvidado } from "@/lib/db/custeio"

import { ConvidadoForm } from "../convidado-form"

export const metadata: Metadata = { title: "Convidado — Confluir" }

export default async function ConvidadoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("custeio_institucional_edicao")
  const { id } = await params
  const convidado = await buscarConvidado(id)
  if (!convidado) notFound()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional/custeios/convidados">
            <ArrowLeft />
            Convidados
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {convidado.nome}
        </h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do convidado</CardTitle>
        </CardHeader>
        <CardContent>
          <ConvidadoForm
            convidado={convidado}
            aoCancelarHref="/painel/institucional/custeios/convidados"
          />
        </CardContent>
      </Card>
    </>
  )
}
