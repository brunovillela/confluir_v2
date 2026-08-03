import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"

import { FonteForm } from "../fonte-form"

export const metadata: Metadata = { title: "Novo empregador — Confluir" }

export default async function NovaFontePage() {
  await requirePermissao("empregadores")

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao/empregadores">
            <ArrowLeft />
            Empregadores
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Novo empregador
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Empregador ou fundo de pensão que paga filiados do sindicato.
        </p>
      </div>
      <FonteForm />
    </>
  )
}
