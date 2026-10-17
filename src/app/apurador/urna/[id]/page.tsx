import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Box } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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

      {/* Envelopes de voto em separado (urna física): o apurador soma à
          contagem só as cédulas dos deferidos (16/10/2026). */}
      {dados.tipo === "fisica" &&
        dados.emSeparado.deferidos.length + dados.emSeparado.pendentes + dados.emSeparado.indeferidos > 0 && (
          <Alert variant={dados.emSeparado.pendentes > 0 ? "warning" : "info"}>
            <AlertTitle>Envelopes de voto em separado</AlertTitle>
            <AlertDescription>
              {dados.emSeparado.deferidos.length > 0 && (
                <p>
                  <strong>
                    {dados.emSeparado.deferidos.length}{" "}
                    {dados.emSeparado.deferidos.length === 1 ? "deferido" : "deferidos"}
                  </strong>{" "}
                  — abra e some à contagem abaixo as cédulas de: {dados.emSeparado.deferidos.join(", ")}.
                </p>
              )}
              {dados.emSeparado.pendentes > 0 && (
                <p>
                  <strong>
                    {dados.emSeparado.pendentes} sem decisão
                  </strong>{" "}
                  — não abra esses envelopes; a comissão decide na apuração da assembleia.
                </p>
              )}
              {dados.emSeparado.indeferidos > 0 && (
                <p>
                  <strong>
                    {dados.emSeparado.indeferidos}{" "}
                    {dados.emSeparado.indeferidos === 1 ? "indeferido" : "indeferidos"}
                  </strong>{" "}
                  — não entram na contagem; guarde sem abrir.
                </p>
              )}
            </AlertDescription>
          </Alert>
        )}

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
