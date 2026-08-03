import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarCategoriasDocumentos } from "@/lib/db/documentos"

import { DocumentoForm } from "../documento-forms"

export const metadata: Metadata = { title: "Novo documento — Confluir" }

export default async function NovoDocumentoPage() {
  await requirePermissao("ferramentas_documentos")
  const categorias = await listarCategoriasDocumentos()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/ferramentas/documentos">
            <ArrowLeft />
            Documentos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Novo documento</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Crie o documento e, se quiser, já anexe o primeiro arquivo (novas
          versões entram na página do documento)
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do documento</CardTitle>
        </CardHeader>
        <CardContent>
          <DocumentoForm
            categorias={categorias}
            aoCancelarHref="/painel/ferramentas/documentos"
          />
        </CardContent>
      </Card>
    </>
  )
}
