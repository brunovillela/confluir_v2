import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"

import { RemessaInformesForm } from "../remessa-form"

export const metadata: Metadata = {
  title: "Nova remessa de informes — Confluir",
}

export default async function NovaRemessaInformesPage() {
  await requirePermissao("pessoal_gestao", ["pessoal_informes_rendimentos"])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/informes">
            <ArrowLeft />
            Informes de rendimentos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Nova remessa</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Agrupa os informes de rendimentos de um ano-base (uma remessa por
          ano).
        </p>
      </div>
      <RemessaInformesForm />
    </>
  )
}
