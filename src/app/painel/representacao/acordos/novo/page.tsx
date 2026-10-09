import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { opcoesFontes } from "@/lib/db/acordos"

import { NovoAcordo } from "./novo-acordo"

export const metadata: Metadata = { title: "Novo acordo — Confluir" }

/** Criar pelo PDF separa as cláusulas na mesma ação (IA em lotes). */
export const maxDuration = 300

export default async function NovoAcordoPage() {
  await requirePermissao("acordos_coletivos")
  const fontes = await opcoesFontes()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao/acordos">
            <ArrowLeft />
            Acordos coletivos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Novo acordo coletivo
        </h1>
      </div>

      <NovoAcordo fontes={fontes} />
    </>
  )
}
