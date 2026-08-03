import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarPessoasAtribuiveis, obterAnomalia } from "@/lib/db/nucleo"

import { atualizarAnomaliaAction } from "../../actions"
import { AnomaliaForm } from "../../anomalia-form"

export const metadata: Metadata = { title: "Editar anomalia — Confluir" }

export default async function EditarAnomaliaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("ferramentas_anomalias")
  const { id } = await params

  const [anomalia, pessoas] = await Promise.all([
    obterAnomalia(id),
    listarPessoasAtribuiveis(),
  ])
  if (!anomalia) notFound()

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/painel/ferramentas/anomalias/${id}`}>
            <ArrowLeft />
            Voltar à anomalia
          </Link>
        </Button>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Editar anomalia</h1>

      <Card>
        <CardContent className="pt-6">
          <AnomaliaForm
            action={atualizarAnomaliaAction}
            dados={{
              id: anomalia.id,
              fato: anomalia.fato,
              conformidade: anomalia.conformidade,
              descricao_detalhada: anomalia.descricaoDetalhada,
              data_ocorrencia: anomalia.dataOcorrencia,
              responsavel_id: anomalia.responsavelId,
              causa_raiz: anomalia.causaRaiz,
              porques: anomalia.porques,
              anomalia_investigada: anomalia.investigada,
              anomalia_tratada: anomalia.tratada,
              eficacia_verificada: anomalia.eficaciaVerificada,
            }}
            pessoas={pessoas}
          />
        </CardContent>
      </Card>
    </>
  )
}
