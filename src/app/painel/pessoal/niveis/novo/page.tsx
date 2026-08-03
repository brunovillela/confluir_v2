import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import {
  listarNivelSalarialBase,
  rotuloNivelSalarial,
  TIPOS_AVANCO,
} from "@/lib/db/carreira"
import { funcionariosParaSelecao } from "@/lib/db/pessoal"
import { formatarMoeda } from "@/lib/formato"

import { NivelLancamentoForm } from "../lancamento-form"

export const metadata: Metadata = {
  title: "Novo lançamento de nível salarial — Confluir",
}

export default async function NovoNivelPage() {
  await requirePermissao("pessoal_gestao", ["pessoal_niveis_salariais"])

  const [funcionarios, base] = await Promise.all([
    funcionariosParaSelecao(),
    listarNivelSalarialBase(),
  ])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/niveis">
            <ArrowLeft />
            Níveis salariais
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Novo lançamento de nível salarial
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Registra o degrau do acordo coletivo em que o funcionário está
          enquadrado.
        </p>
      </div>
      <NivelLancamentoForm
        funcionarios={funcionarios}
        tiposAvanco={TIPOS_AVANCO}
        niveis={base.map((b) => ({
          id: b.id,
          rotulo: `${rotuloNivelSalarial(b)} — ${formatarMoeda(b.salario_base)}`,
          cargoNome: b.cargoNome ?? "(sem cargo)",
        }))}
      />
    </>
  )
}
