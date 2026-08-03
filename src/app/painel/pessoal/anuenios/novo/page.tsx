import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { formatarAliquota, listarAnuenioBase } from "@/lib/db/carreira"
import { funcionariosParaSelecao } from "@/lib/db/pessoal"

import { AnuenioLancamentoForm } from "../lancamento-form"

export const metadata: Metadata = {
  title: "Novo lançamento de anuênio — Confluir",
}

export default async function NovoAnuenioPage() {
  await requirePermissao("pessoal_gestao", ["pessoal_anuenios"])

  const [funcionarios, base] = await Promise.all([
    funcionariosParaSelecao(),
    listarAnuenioBase(),
  ])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/anuenios">
            <ArrowLeft />
            Anuênios
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Novo lançamento de anuênio
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Registra o nível vigente do funcionário — o avanço seguinte é
          calculado a partir da data informada.
        </p>
      </div>
      <AnuenioLancamentoForm
        funcionarios={funcionarios}
        niveis={base.map((b) => ({
          id: b.id,
          rotulo: `Nível ${b.nivel ?? "?"} — ${formatarAliquota(b.aliquota)}`,
        }))}
      />
    </>
  )
}
