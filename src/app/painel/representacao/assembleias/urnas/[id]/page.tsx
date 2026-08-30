import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { ModalidadeBadge } from "@/components/assembleias"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { dadosUrnasAssembleia } from "@/lib/db/votacao-mesarios"

import { UrnasEMesarios } from "./urnas-mesarios"

export const metadata: Metadata = { title: "Urnas e mesários — Confluir" }

export default async function UrnasAssembleiaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("assembleias")
  const { id } = await params
  const dados = await dadosUrnasAssembleia(id)
  if (!dados) notFound()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/representacao/assembleias">
            <ArrowLeft />
            Assembleias
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Urnas e mesários — {dados.nome ?? "assembleia"}
          </h1>
          <ModalidadeBadge modalidade={dados.modalidade} />
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          O mesário registra a <strong>presença</strong> do eleitor — nunca o
          voto. Na urna digital, a presença libera a cédula num terminal de
          votação pareado, onde o próprio eleitor vota (secreto).
        </p>
      </div>

      <Alert>
        <AlertDescription>
          O ambiente do mesário fica em <code>/mesario</code> e o terminal de
          votação (urna digital) em <code>/urna</code>. O acesso à urna respeita
          o horário definido em cada urna abaixo.
        </AlertDescription>
      </Alert>

      <UrnasEMesarios
        assembleiaId={dados.assembleiaId}
        rodadaId={dados.rodadaId}
        urnas={dados.urnas}
        mesarios={dados.mesarios}
      />
    </>
  )
}
