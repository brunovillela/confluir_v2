import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarPessoasAtribuiveis, obterDemanda } from "@/lib/db/nucleo"
import { comPessoasAtuais } from "@/lib/db/opcoes-pessoas"

import { atualizarDemandaAction } from "../../actions"
import { DemandaForm } from "../../demanda-form"

export const metadata: Metadata = { title: "Editar demanda — Confluir" }

export default async function EditarDemandaPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("ferramentas_demandas")
  const { id } = await params

  const [demanda, ativos] = await Promise.all([
    obterDemanda(id),
    listarPessoasAtribuiveis(),
  ])
  if (!demanda) notFound()
  // Responsável que saiu da lista continua selecionado (lib/db/opcoes-pessoas).
  const pessoas = await comPessoasAtuais(ativos, [demanda.responsavelId])

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/painel/ferramentas/demandas/${id}`}>
            <ArrowLeft />
            Voltar à demanda
          </Link>
        </Button>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Editar demanda</h1>

      <Card>
        <CardContent className="pt-6">
          <DemandaForm
            action={atualizarDemandaAction}
            dados={{
              id: demanda.id,
              nome: demanda.nome,
              descricao: demanda.descricao,
              situacao: demanda.situacao,
              prazo: demanda.prazo,
              orcamento: demanda.orcamento,
              membro_responsavel_id: demanda.responsavelId,
            }}
            pessoas={pessoas}
          />
        </CardContent>
      </Card>
    </>
  )
}
