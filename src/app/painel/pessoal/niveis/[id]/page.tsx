import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { CabecalhoFuncionario } from "@/components/pessoal/cabecalho-funcionario"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import {
  buscarNivelSalarial,
  listarNivelSalarialBase,
  rotuloNivelSalarial,
  TIPOS_AVANCO,
} from "@/lib/db/carreira"
import { funcionariosParaSelecao } from "@/lib/db/pessoal"
import { funcionarioDaArea } from "@/lib/db/pessoal-area"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { NivelLancamentoForm } from "../lancamento-form"

export const metadata: Metadata = {
  title: "Editar lançamento de nível salarial — Confluir",
}

export default async function EditarNivelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  /** de: "carreira" (Carreira do funcionário), "funcionarios" (aba Funcionários); sem ele, Lançamentos. */
  searchParams: Promise<{ de?: string }>
}) {
  const sessao = await requirePermissao("pessoal_gestao", ["pessoal_niveis_salariais"])

  const { id } = await params
  const { de } = await searchParams
  const [lancamento, funcionarios, base] = await Promise.all([
    buscarNivelSalarial(id),
    funcionariosParaSelecao(),
    listarNivelSalarialBase(),
  ])
  if (!lancamento) notFound()
  const funcionario = lancamento.funcionario_id ? await funcionarioDaArea(lancamento.funcionario_id) : null
  const voltar =
    de === "carreira" && lancamento.funcionario_id
      ? { href: `/painel/pessoal/carreira/funcionario/${lancamento.funcionario_id}`, rotulo: lancamento.funcionarioNome ?? "Carreira" }
      : de === "funcionarios"
        ? { href: "/painel/pessoal/niveis", rotulo: "Níveis salariais" }
        : { href: "/painel/pessoal/niveis?aba=lancamentos", rotulo: "Lançamentos de níveis salariais" }

  return (
    <>
      <RotuloTrilha valores={{ [id]: "Editar lançamento de nível salarial" }} />
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1 self-start">
        <Link href={voltar.href}>
          <ArrowLeft />
          {voltar.rotulo}
        </Link>
      </Button>
      {funcionario ? (
        <CabecalhoFuncionario
          funcionario={funcionario}
          area="carreira"
          permissoes={sessao.permissoes}
          titulo={`${funcionario.nome} — nível salarial de ${formatarData(lancamento.nivel_atual_data)}`}
        />
      ) : (
        <h1 className="text-2xl font-semibold tracking-tight">Editar lançamento de nível salarial</h1>
      )}
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
