import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"

import { AtividadeForm } from "../atividade-form"

export const metadata: Metadata = { title: "Nova atividade — Confluir" }

export default async function NovaAtividadePage() {
  await requirePermissao("pessoal_gestao")

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/pessoal/atribuicoes/atividades">
            <ArrowLeft />
            Atividades
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Nova atividade</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Depois de criar, você adiciona ferramentas, perigos e medidas, vincula
          os executores (com tempo e recorrência de cada um) e avalia os riscos
          por executor — e pode pedir a análise SST à IA.
        </p>
      </div>
      <AtividadeForm />
    </>
  )
}
