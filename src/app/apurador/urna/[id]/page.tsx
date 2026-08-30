import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Box } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { dadosApuracaoUrna } from "@/lib/db/votacao-apuracao"

import { ApuracaoUrna } from "./apuracao"

export const metadata: Metadata = { title: "Apurar urna — Confluir" }

export default async function ApurarUrnaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const dados = await dadosApuracaoUrna(id)
  if (!dados) notFound()

  return (
    <div className="mx-auto grid max-w-2xl gap-5 px-4 py-8">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/apurador">
            <ArrowLeft />
            Minhas urnas
          </Link>
        </Button>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Box className="size-5" />
          {dados.nome ?? "Urna"}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {dados.assembleiaNome ?? "Assembleia"} ·{" "}
          {dados.tipo === "fisica" ? "física" : "digital"}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Apuração da urna</CardTitle>
          <CardDescription>
            Confira os lacres, ateste a integridade e lance a contagem por opção,
            com branco e nulo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ApuracaoUrna dados={dados} />
        </CardContent>
      </Card>
    </div>
  )
}
