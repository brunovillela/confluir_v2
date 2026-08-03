import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"

import { ImportarCatPdf } from "../../importar-cat-pdf"

export const metadata: Metadata = { title: "Ler CAT de PDF — Confluir" }

export default async function CatPdfPage() {
  await requirePermissao("saude_cat", ["saude_gestao"])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/saude/cat/nova">
            <ArrowLeft />
            Incluir CAT
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Ler CAT de PDF com IA
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Suba o formulário da CAT em PDF; a IA extrai os campos e pré-preenche
          o cadastro para você revisar e salvar.
        </p>
      </div>

      <Card>
        <CardContent>
          <ImportarCatPdf />
        </CardContent>
      </Card>
    </>
  )
}
