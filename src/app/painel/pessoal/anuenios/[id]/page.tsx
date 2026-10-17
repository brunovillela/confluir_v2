import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { CabecalhoFuncionario } from "@/components/pessoal/cabecalho-funcionario"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { formatarData } from "@/lib/formato"
import {
  buscarAnuenio,
  formatarAliquota,
  listarAnuenioBase,
} from "@/lib/db/carreira"
import { funcionariosParaSelecao } from "@/lib/db/pessoal"
import { funcionarioDaArea } from "@/lib/db/pessoal-area"

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
  const sessao = await requirePermissao("pessoal_gestao", ["pessoal_anuenios"])

  const { id } = await params
  const { de } = await searchParams
  const [lancamento, funcionarios, base] = await Promise.all([
    buscarAnuenio(id),
    funcionariosParaSelecao(),
    listarAnuenioBase(),
  ])
  if (!lancamento) notFound()
  const funcionario = lancamento.funcionario_id ? await funcionarioDaArea(lancamento.funcionario_id) : null
  const voltar =
    de === "carreira" && lancamento.funcionario_id
      ? { href: `/painel/pessoal/carreira/funcionario/${lancamento.funcionario_id}`, rotulo: lancamento.funcionarioNome ?? "Carreira" }
      : de === "funcionarios"
        ? { href: "/painel/pessoal/anuenios", rotulo: "Anuênios" }
        : { href: "/painel/pessoal/anuenios?aba=lancamentos", rotulo: "Lançamentos de anuênios" }

  return (
    <>
      <RotuloTrilha valores={{ [id]: "Editar lançamento de anuênio" }} />
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
          titulo={`${funcionario.nome} — anuênio de ${formatarData(lancamento.nivel_atual_data)}`}
        />
      ) : (
        <h1 className="text-2xl font-semibold tracking-tight">Editar lançamento de anuênio</h1>
      )}
      <p className="text-muted-foreground text-xs">O próximo nível é recalculado ao salvar.</p>
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
