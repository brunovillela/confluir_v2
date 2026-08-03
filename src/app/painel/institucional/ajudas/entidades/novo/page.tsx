import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"

import { FornecedorForm } from "../../../../compras/fornecedores/fornecedor-forms"
import { atualizarEntidadeAction, criarEntidadeAction } from "../actions"

export const metadata: Metadata = { title: "Nova entidade apoiada — Confluir" }

export default async function NovaEntidadePage() {
  await requirePermissao("apoio_institucional_edicao")

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional/ajudas/entidades">
            <ArrowLeft />
            Entidades apoiadas
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nova entidade apoiada
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Endereços e dados bancários entram na página da entidade
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados básicos</CardTitle>
        </CardHeader>
        <CardContent>
          <FornecedorForm
            aoCancelarHref="/painel/institucional/ajudas/entidades"
            acaoCriar={criarEntidadeAction}
            acaoAtualizar={atualizarEntidadeAction}
            rotuloEntidade="entidade apoiada"
            rotuloBloqueio="Bloqueada para ajuda"
          />
        </CardContent>
      </Card>
    </>
  )
}
