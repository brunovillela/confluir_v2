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

export default async function NovoNivelPage({
  searchParams,
}: {
  /** funcionario: já vem escolhido; de=carreira: volta à Carreira dele ao salvar. */
  searchParams: Promise<{ funcionario?: string; de?: string }>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_niveis_salariais"])

  const sp = await searchParams
  const [funcionarios, base] = await Promise.all([
    funcionariosParaSelecao(),
    listarNivelSalarialBase(),
  ])
  const escolhido = funcionarios.find((f) => f.usuarioId === sp.funcionario)
  const daCarreira = sp.de === "carreira" && Boolean(escolhido)
  const voltar = daCarreira
    ? { href: `/painel/pessoal/carreira/funcionario/${escolhido!.usuarioId}`, rotulo: escolhido!.nome }
    : { href: "/painel/pessoal/niveis", rotulo: "Níveis salariais" }

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={voltar.href}>
            <ArrowLeft />
            {voltar.rotulo}
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
        funcionarioInicial={escolhido?.usuarioId}
        de={daCarreira ? "carreira" : undefined}
        voltarHref={voltar.href}
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
