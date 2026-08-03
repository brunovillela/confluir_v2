import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarCentrosCusto } from "@/lib/db/financeiro"

import { criarProjetoAction } from "../actions"
import { ProjetoForm } from "../projeto-form"

export const metadata: Metadata = { title: "Novo projeto — Confluir" }

export default async function NovoProjetoPage() {
  await requirePermissao("ferramentas_projetos_edicao")
  const centros = await listarCentrosCusto()

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/ferramentas/projetos">
            <ArrowLeft />
            Projetos
          </Link>
        </Button>
      </div>
      <h1 className="text-2xl font-semibold tracking-tight">Novo projeto</h1>

      <Card>
        <CardContent className="pt-6">
          <ProjetoForm
            action={criarProjetoAction}
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
