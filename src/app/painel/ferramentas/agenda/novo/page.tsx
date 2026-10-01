import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { sedesParaAgenda } from "@/lib/db/agenda"
import { listarDepartamentos } from "@/lib/db/compras"

import { CompromissoForm } from "../agenda-forms"

export const metadata: Metadata = { title: "Novo compromisso — Confluir" }

export default async function NovoCompromissoPage() {
  await requirePermissao("ferramentas_agendas_edicao")
  const [sedes, departamentos] = await Promise.all([sedesParaAgenda(), listarDepartamentos()])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/ferramentas/agenda">
            <ArrowLeft />
            Agenda
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Novo compromisso</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Compromisso avulso da Agenda — reunião, curso, atividade… Eventos e votações entram
          sozinhos, pelas próprias áreas.
        </p>
      </div>
      <CompromissoForm sedes={sedes} departamentos={departamentos} />
    </>
  )
}
