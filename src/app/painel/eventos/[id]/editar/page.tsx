import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { obterConfig, obterEvento } from "@/lib/db/eventos"

import { EventoForm } from "../../evento-forms"

export const metadata: Metadata = { title: "Editar evento — Confluir" }

export default async function EditarEventoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("eventos_gestao")
  const { id } = await params
  const [evento, { config }] = await Promise.all([obterEvento(id), obterConfig()])
  if (!evento) notFound()

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href={`/painel/eventos/${id}`}>
            <ArrowLeft />
            {evento.titulo ?? "Evento"}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Editar evento</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados do evento</CardTitle>
        </CardHeader>
        <CardContent>
          <EventoForm
            modoFoto={config.modo_foto}
            inicial={{
              id: evento.id,
              titulo: evento.titulo,
              descricao: evento.descricao,
              local: evento.local,
              endereco: evento.endereco,
              inicio: evento.inicio,
              termino: evento.termino,
              lotacao_maxima: evento.lotacao_maxima,
              overbooking_percentual: evento.overbooking_percentual,
              inscricoes_abrem_em: evento.inscricoes_abrem_em,
              inscricoes_fecham_em: evento.inscricoes_fecham_em,
              limite_inscricoes: evento.limite_inscricoes,
              cota_convidados: evento.cota_convidados,
              exige_aprovacao: evento.exige_aprovacao,
              confirma_filiado_automatico: evento.confirma_filiado_automatico,
              exige_foto: evento.exige_foto,
              exige_rsvp: evento.exige_rsvp,
            }}
          />
        </CardContent>
      </Card>
    </>
  )
}
