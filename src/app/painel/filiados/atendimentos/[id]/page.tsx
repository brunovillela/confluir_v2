import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ENTRADA_ATENDIMENTOS } from "@/lib/atendimento-constantes"
import { requirePermissao } from "@/lib/auth"
import { obterAtendimentoPara } from "@/lib/db/portal-atendimentos"

import { AtendimentoPainel } from "../atendimento-painel"

export const metadata: Metadata = { title: "Solicitação do filiado — Confluir" }

export default async function AtendimentoPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await requirePermissao(ENTRADA_ATENDIMENTOS[0], [...ENTRADA_ATENDIMENTOS[1]])
  const { id } = await params
  // Pedido de saúde para quem não é da saúde (R2): como se não existisse.
  const dados = await obterAtendimentoPara(sessao.permissoes, id)
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
