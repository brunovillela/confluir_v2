import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { buscarFontePagadora } from "@/lib/db/fontes"

import { FonteForm } from "../../fonte-form"

export const metadata: Metadata = { title: "Editar empregador — Confluir" }

export default async function EditarFontePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("empregadores")

  const { id } = await params
  const fonte = await buscarFontePagadora(id)
  if (!fonte) notFound()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/painel/representacao/empregadores/${id}`}>
            <ArrowLeft />
            {fonte.nome_fantasia ?? fonte.nome_razao ?? "Empregador"}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Editar empregador
        </h1>
      </div>
      <FonteForm fonte={fonte} />
    </>
  )
}
