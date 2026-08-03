import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"

import { FornecedorForm } from "../fornecedor-forms"

export const metadata: Metadata = { title: "Novo fornecedor — Confluir" }

export default async function NovoFornecedorPage() {
  await requirePermissao("aquisicoes_fornecedores", [
    "aquisicoes_compras_edicao",
  ])
  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras/fornecedores">
            <ArrowLeft />
            Fornecedores
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Novo fornecedor
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Cadastro básico — endereço e dados bancários entram na página do
          fornecedor
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do fornecedor</CardTitle>
        </CardHeader>
        <CardContent>
          <FornecedorForm aoCancelarHref="/painel/compras/fornecedores" />
        </CardContent>
      </Card>
    </>
  )
}
