import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarCentrosCusto } from "@/lib/db/financeiro"
import { obterProjeto } from "@/lib/db/projetos"

import { atualizarProjetoAction } from "../../actions"
import { ProjetoForm } from "../../projeto-form"

export const metadata: Metadata = { title: "Editar projeto — Confluir" }

export default async function EditarProjetoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("ferramentas_projetos_edicao")
  const { id } = await params

  const [projeto, centros] = await Promise.all([
    obterProjeto(id),
    listarCentrosCusto(),
  ])
  if (!projeto) notFound()

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/painel/ferramentas/projetos/${id}`}>
            <ArrowLeft />
            Voltar ao projeto
          </Link>
        </Button>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Editar projeto</h1>

      <Card>
        <CardContent className="pt-6">
          <ProjetoForm
            action={atualizarProjetoAction}
            dados={{
              id: projeto.id,
              titulo: projeto.titulo,
              tipo: projeto.tipo,
              detalhamento: projeto.detalhamento,
              orcamento: projeto.orcamento,
              inicio: projeto.inicio,
              termino_previsao: projeto.termino_previsao,
              centro_custo_id: projeto.centroCustoId,
              estrategico: projeto.estrategico,
            }}
            centros={centros.map((c) => ({
              id: c.id,
              rotulo: c.classificador
                ? `${c.classificador} — ${c.nome_da_conta ?? ""}`
                : (c.nome_da_conta ?? "(sem nome)"),
            }))}
          />
        </CardContent>
      </Card>
    </>
  )
}
