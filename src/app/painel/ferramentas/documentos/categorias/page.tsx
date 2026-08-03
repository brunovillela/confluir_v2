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
import { listarCategoriasDocumentosComUso } from "@/lib/db/documentos"

import { ListaCategorias, NovaCategoria } from "./categorias-forms"

export const metadata: Metadata = {
  title: "Categorias de documentos — Confluir",
}

export default async function CategoriasDocumentosPage() {
  await requirePermissao("ferramentas_documentos")
  const categorias = await listarCategoriasDocumentosComUso()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/ferramentas/documentos">
            <ArrowLeft />
            Documentos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Categorias de documentos
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Organize os documentos institucionais por categoria
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
            categoria em uso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ListaCategorias categorias={categorias} />
        </CardContent>
      </Card>
    </>
  )
}
