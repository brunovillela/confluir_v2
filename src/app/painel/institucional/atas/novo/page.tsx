import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { opcoesMandatos } from "@/lib/db/atas"

import { AtaForm } from "../ata-form"

export const metadata: Metadata = { title: "Nova ata — Confluir" }

export default async function NovaAtaPage({
  searchParams,
}: {
  searchParams: Promise<{ mandato?: string }>
}) {
  await requirePermissao("diretoria_reunioes")
  const { mandato } = await searchParams
  const mandatos = await opcoesMandatos()

  const voltarHref = mandato
    ? `/painel/institucional/diretoria/${mandato}`
    : "/painel/institucional/atas"

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={voltarHref}>
            <ArrowLeft />
            {mandato ? "Mandato" : "Atas de reunião"}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Nova ata</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da reunião</CardTitle>
        </CardHeader>
        <CardContent>
          <AtaForm
            mandatos={mandatos}
            mandatoPadrao={mandato}
            aoCancelarHref={voltarHref}
          />
        </CardContent>
      </Card>
    </>
  )
}
