import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarCategoriasContrato } from "@/lib/db/contratos"

import { ListaCategorias, NovaCategoria } from "./categorias-forms"

export const metadata: Metadata = { title: "Categorias de contrato — Confluir" }

export default async function CategoriasContratoPage() {
  await requirePermissao("aquisicoes_contratos_edicao")
  const categorias = await listarCategoriasContrato()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras/contratos">
            <ArrowLeft />
            Contratos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Categorias de contrato
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Organize os contratos por categoria. As sigilosas escondem seus
          contratos da listagem para quem não tem permissão de edição.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova categoria</CardTitle>
        </CardHeader>
        <CardContent>
          <NovaCategoria />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Categorias cadastradas</CardTitle>
          <CardDescription>
            {categorias.length} categoria(s). Não é possível excluir uma
            categoria em uso — reatribua os contratos antes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ListaCategorias categorias={categorias} />
        </CardContent>
      </Card>
    </>
  )
}
