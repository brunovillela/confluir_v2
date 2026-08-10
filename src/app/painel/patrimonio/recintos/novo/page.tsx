import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"

import { criarRecintoAction } from "../../actions"
import { RecintoForm } from "../../recinto-form"

export const metadata: Metadata = { title: "Novo recinto — Confluir" }

export default async function NovoRecintoPage() {
  await requirePermissao("patrimonio_geral")
  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/patrimonio/recintos">
            <ArrowLeft />
            Recintos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Novo recinto</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Local onde os bens patrimoniais ficam alocados
        </p>
      </div>
      <Card>
        <CardContent>
          <RecintoForm action={criarRecintoAction} />
        </CardContent>
      </Card>
    </>
  )
}
