import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { listarFuncoes, obterLimiarRotina } from "@/lib/db/pessoal-sst"

import { TarefaForm } from "../tarefa-form"

export const metadata: Metadata = { title: "Nova tarefa — Confluir" }

export default async function NovaTarefaPage() {
  await requirePermissao("pessoal_gestao")
  const [funcoes, limiar] = await Promise.all([
    listarFuncoes(),
    obterLimiarRotina(),
  ])

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/pessoal/atribuicoes/tarefas">
            <ArrowLeft />
            Tarefas
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Nova tarefa</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Depois de criar, você adiciona ferramentas, perigos, riscos, medidas e
          os executores — e pode pedir a análise SST à IA.
        </p>
      </div>
      <TarefaForm
        funcoes={funcoes.map((f) => ({ id: f.id, nome: f.nome }))}
        limiar={limiar}
      />
    </>
  )
}
