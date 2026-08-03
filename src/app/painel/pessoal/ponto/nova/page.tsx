import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"

import { RemessaPontoForm } from "../remessa-form"

export const metadata: Metadata = {
  title: "Nova remessa de controle de ponto — Confluir",
}

export default async function NovaRemessaPontoPage() {
  await requirePermissao("pessoal_gestao")

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/ponto">
            <ArrowLeft />
            Remessas de controle de ponto
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Nova remessa</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Agrupa os registros de ponto de um mês de referência. O nome é gerado
          automaticamente (Mês/Ano).
        </p>
      </div>
      <RemessaPontoForm />
    </>
  )
}
