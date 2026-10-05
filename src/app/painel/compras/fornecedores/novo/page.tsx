import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { CHAVE_EDICAO_FORNECEDORES } from "@/lib/fornecedores-acesso"

import { consultarCnpjFornecedor } from "../actions"
import { FornecedorForm } from "../fornecedor-forms"

export const metadata: Metadata = { title: "Novo fornecedor — Confluir" }

export default async function NovoFornecedorPage() {
  await requirePermissao(CHAVE_EDICAO_FORNECEDORES)
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
          Pelo CNPJ, a Receita Federal e a IA preenchem o cadastro; dados
          bancários entram depois, na página do fornecedor
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do fornecedor</CardTitle>
        </CardHeader>
        <CardContent>
          <FornecedorForm
            aoCancelarHref="/painel/compras/fornecedores"
            consultarCnpj={consultarCnpjFornecedor}
          />
        </CardContent>
      </Card>
    </>
  )
}
