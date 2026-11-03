import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { listarTabelasSalariais } from "@/lib/db/tabelas-salariais"
import { rotuloTabelaSalarial } from "@/lib/tabela-salarial"

import { TabelaVigenciaForm } from "../tabela-vigencia-form"

export const metadata: Metadata = { title: "Nova tabela salarial — Confluir" }

export default async function NovaTabelaSalarialPage() {
  await requirePermissao("pessoal_gestao", ["pessoal_niveis_salariais"])
  const tabelas = await listarTabelasSalariais()
  // A vigente primeiro: é a origem mais comum da tabela seguinte.
  const origens = [...tabelas]
    .filter((t) => t.degraus > 0)
    .sort((a, b) => Number(b.vigente) - Number(a.vigente))
    .map((t) => ({ id: t.id, rotulo: rotuloTabelaSalarial(t) }))

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/niveis/tabelas">
            <ArrowLeft />
            Tabelas salariais
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Nova tabela salarial</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          A tabela nasce guardada: nenhum salário muda até você torná-la a vigente.
        </p>
      </div>
      <TabelaVigenciaForm origens={origens} />
    </>
  )
}
