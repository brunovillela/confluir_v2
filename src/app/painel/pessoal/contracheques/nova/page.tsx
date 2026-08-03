import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"

import { RemessaContrachequesForm } from "../remessa-form"

export const metadata: Metadata = { title: "Nova remessa de contracheques — Confluir" }

export default async function NovaRemessaContrachequesPage() {
  await requirePermissao("pessoal_gestao", ["pessoal_contracheque"])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/contracheques">
            <ArrowLeft />
            Remessas de contracheques
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Nova remessa</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Agrupa os contracheques de um período e natureza (mensal,
          adiantamento, 13º, férias ou complementar).
        </p>
      </div>
      <RemessaContrachequesForm />
    </>
  )
}
