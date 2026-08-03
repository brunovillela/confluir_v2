import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import {
  buscarNivelSalarial,
  listarNivelSalarialBase,
  rotuloNivelSalarial,
  TIPOS_AVANCO,
} from "@/lib/db/carreira"
import { funcionariosParaSelecao } from "@/lib/db/pessoal"
import { formatarMoeda } from "@/lib/formato"

import { NivelLancamentoForm } from "../lancamento-form"

export const metadata: Metadata = {
  title: "Editar lançamento de nível salarial — Confluir",
}

export default async function EditarNivelPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_niveis_salariais"])

  const { id } = await params
  const [lancamento, funcionarios, base] = await Promise.all([
    buscarNivelSalarial(id),
    funcionariosParaSelecao(),
    listarNivelSalarialBase(),
  ])
  if (!lancamento) notFound()

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
          Editar lançamento de nível salarial
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {lancamento.funcionarioNome ?? "(sem nome)"}
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
        lancamento={{
          id: lancamento.id,
          funcionario_id: lancamento.funcionario_id,
          funcionarioNome: lancamento.funcionarioNome,
          tipo_avanco: lancamento.tipo_avanco,
          nivel_atual_id: lancamento.nivel_atual_id,
          nivel_atual_data: lancamento.nivel_atual_data,
          proximo_nivel_id: lancamento.proximo_nivel_id,
          proximo_nivel_data: lancamento.proximo_nivel_data,
        }}
      />
    </>
  )
}
