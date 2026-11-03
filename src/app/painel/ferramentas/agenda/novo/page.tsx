import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { sedesParaAgenda } from "@/lib/db/agenda"
import { listarDepartamentos } from "@/lib/db/compras"

import { CompromissoForm } from "../agenda-forms"

export const metadata: Metadata = { title: "Novo compromisso — Confluir" }

type Params = Partial<
  Record<"atividade" | "tipo" | "local" | "inicio" | "termino" | "data_inicio" | "data_termino" | "dia_todo", string>
>

/** Só aceita o formato do campo; o resto da URL não entra no formulário. */
function campoDataHora(v: string | undefined): string {
  return v && /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/.test(v) ? v : ""
}

export default async function NovoCompromissoPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  await requirePermissao("ferramentas_agendas_edicao")
  // Vem do calendário, em "Mais opções": o que já foi digitado.
  const q = await searchParams
  const diaTodo = q.dia_todo === "1"
  const inicial = {
    atividade: q.atividade ?? null,
    tipo: q.tipo ?? null,
    local: q.local ?? null,
    diaTodo,
    inicio: campoDataHora(diaTodo ? q.data_inicio : q.inicio),
    termino: campoDataHora(diaTodo ? q.data_termino : q.termino),
  }
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
      <CompromissoForm inicial={inicial} sedes={sedes} departamentos={departamentos} />
    </>
  )
}
