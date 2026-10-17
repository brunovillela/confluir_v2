import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import {
  buscarAnuenio,
  formatarAliquota,
  listarAnuenioBase,
} from "@/lib/db/carreira"
import { funcionariosParaSelecao } from "@/lib/db/pessoal"

import { AnuenioLancamentoForm } from "../lancamento-form"

export const metadata: Metadata = {
  title: "Editar lançamento de anuênio — Confluir",
}

export default async function EditarAnuenioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  /** de: "carreira" (Carreira do funcionário), "funcionarios" (aba Funcionários); sem ele, Lançamentos. */
  searchParams: Promise<{ de?: string }>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_anuenios"])

  const { id } = await params
  const { de } = await searchParams
  const [lancamento, funcionarios, base] = await Promise.all([
    buscarAnuenio(id),
    funcionariosParaSelecao(),
    listarAnuenioBase(),
  ])
  if (!lancamento) notFound()
  const voltar =
    de === "carreira" && lancamento.funcionario_id
      ? { href: `/painel/pessoal/carreira/funcionario/${lancamento.funcionario_id}`, rotulo: lancamento.funcionarioNome ?? "Carreira" }
      : de === "funcionarios"
        ? { href: "/painel/pessoal/anuenios", rotulo: "Anuênios" }
        : { href: "/painel/pessoal/anuenios?aba=lancamentos", rotulo: "Lançamentos de anuênios" }

  return (
    <>
      <RotuloTrilha valores={{ [id]: "Editar lançamento de anuênio" }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={voltar.href}>
            <ArrowLeft />
            {voltar.rotulo}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Editar lançamento de anuênio
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {lancamento.funcionarioNome ?? "(sem nome)"} — próximo nível é
          recalculado ao salvar.
        </p>
      </div>
      <AnuenioLancamentoForm
        funcionarios={funcionarios}
        niveis={base.map((b) => ({
          id: b.id,
          rotulo: `Nível ${b.nivel ?? "?"} — ${formatarAliquota(b.aliquota)}`,
        }))}
        lancamento={{
          id: lancamento.id,
          funcionario_id: lancamento.funcionario_id,
          funcionarioNome: lancamento.funcionarioNome,
          nivel_atual_id: lancamento.nivel_atual_id,
          nivel_atual_data: lancamento.nivel_atual_data,
          informado_contabilidade: lancamento.informado_contabilidade,
        }}
      />
    </>
  )
}
