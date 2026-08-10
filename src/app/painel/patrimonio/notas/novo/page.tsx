import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarFornecedores } from "@/lib/db/compras"

import { criarNotaAction } from "../../actions"
import { NotaForm } from "../nota-form"

export const metadata: Metadata = { title: "Nova nota fiscal — Confluir" }

export default async function NovaNotaPage() {
  await requirePermissao("patrimonio_geral")
  const fornecedores = await listarFornecedores()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/patrimonio/notas">
            <ArrowLeft />
            Notas fiscais
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nova nota fiscal
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Nota de entrada ou saída de bens patrimoniais
        </p>
      </div>
      <Card>
        <CardContent>
          <NotaForm
            action={criarNotaAction}
            fornecedores={fornecedores.map((f) => ({
              id: f.id,
              nome: f.nome,
              cnpj_cpf: f.cnpj_cpf,
              bloqueado: false,
            }))}
          />
        </CardContent>
      </Card>
    </>
  )
}
