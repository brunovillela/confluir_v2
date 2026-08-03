import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"

import { RemessaForm } from "../remessa-form"

export const metadata: Metadata = { title: "Nova remessa — Confluir" }

export default async function NovaRemessaPage() {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/filiados/receitas">
            <ArrowLeft />
            Receitas
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Nova remessa</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Abre uma remessa de recebimento de contribuições (mês, ano e tipo).
        </p>
      </div>
      <RemessaForm />
    </>
  )
}
