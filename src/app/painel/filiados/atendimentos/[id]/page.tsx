import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { obterAtendimento } from "@/lib/db/portal-atendimentos"

import { AtendimentoPainel } from "../atendimento-painel"

export const metadata: Metadata = { title: "Solicitação do filiado — Confluir" }

export default async function AtendimentoPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissao("ferramentas_demandas", ["ferramentas_tarefas", "filiacao_filiados"])
  const { id } = await params
  const dados = await obterAtendimento(id)
  if (!dados) notFound()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/filiados/atendimentos">
            <ArrowLeft />
            Atendimentos
          </Link>
        </Button>
      </div>
      <AtendimentoPainel atendimento={dados.atendimento} mensagens={dados.mensagens} />
    </>
  )
}
