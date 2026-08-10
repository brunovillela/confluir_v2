import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarRecintosOpcoes } from "@/lib/db/patrimonio"

import { criarItemAction } from "../actions"
import { ItemForm } from "../item-form"

export const metadata: Metadata = { title: "Novo item — Confluir" }

export default async function NovoItemPage() {
  await requirePermissao("patrimonio_geral")
  const recintos = await listarRecintosOpcoes()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/patrimonio/itens">
            <ArrowLeft />
            Itens
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Novo item</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Cadastro de um bem patrimonial — vincule a um recinto se já existir
        </p>
      </div>
      <Card>
        <CardContent>
          <ItemForm action={criarItemAction} recintos={recintos} />
        </CardContent>
      </Card>
    </>
  )
}
