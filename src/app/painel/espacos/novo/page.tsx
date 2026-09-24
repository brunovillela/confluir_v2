import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import {
  listarRecintosParaEspaco,
  listarResponsaveisPossiveis,
  listarSedes,
} from "@/lib/db/espacos"

import { EspacoForm } from "../espaco-form"

export const metadata: Metadata = { title: "Novo espaço — Confluir" }

export default async function NovoEspacoPage() {
  await requirePermissao("espacos_gestao")
  const [sedes, ambientes, responsaveis] = await Promise.all([
    listarSedes(),
    listarRecintosParaEspaco(),
    listarResponsaveisPossiveis(),
  ])

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/painel/espacos" aria-label="Voltar para cessão de espaços">
            <ArrowLeft />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Novo espaço</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            O que se cede, com a lotação e as regras da cessão
          </p>
        </div>
      </div>

      <div className="max-w-4xl">
        <EspacoForm sedes={sedes} ambientes={ambientes} responsaveis={responsaveis} />
      </div>
    </>
  )
}
