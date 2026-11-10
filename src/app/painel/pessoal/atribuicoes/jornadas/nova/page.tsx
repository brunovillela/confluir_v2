import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"

import { JornadaForm } from "../jornada-form"

export const metadata: Metadata = { title: "Nova jornada de trabalho — Confluir" }

/** Nova jornada: ao criar, abre a página dela para incluir os funcionários. */
export default async function NovaJornadaPage() {
  await requirePermissao("pessoal_gestao")
  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/pessoal/atribuicoes/jornadas">
            <ArrowLeft />
            Jornadas de trabalho
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Nova jornada</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Dê um nome e informe o horário de cada dia. Depois de criar, inclua os funcionários que a seguem.
        </p>
      </div>
      <Card>
        <CardContent className="pt-6">
          <JornadaForm dias={[]} vinculados={0} cancelarHref="/painel/pessoal/atribuicoes/jornadas" />
        </CardContent>
      </Card>
    </>
  )
}
