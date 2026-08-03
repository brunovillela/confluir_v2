import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { buscarRemessa } from "@/lib/db/receitas"

import { RemessaForm } from "../../remessa-form"

export const metadata: Metadata = { title: "Editar remessa — Confluir" }

export default async function EditarRemessaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])

  const { id } = await params
  const remessa = await buscarRemessa(id)
  if (!remessa) notFound()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/painel/filiados/receitas/${id}`}>
            <ArrowLeft />
            Remessa {remessa.tipo ?? ""} {remessa.rotulo}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Editar remessa
        </h1>
      </div>
      <RemessaForm
        remessa={{
          id: remessa.id,
          ano: remessa.ano,
          ordem: remessa.ordem,
          tipo: remessa.tipo,
          aberto: remessa.aberto,
        }}
      />
    </>
  )
}
