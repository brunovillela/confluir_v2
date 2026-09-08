import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarCategoriasConvenio } from "@/lib/db/filiacao-convenios-edicao"

import { Categorias } from "./categorias"

export const metadata: Metadata = { title: "Categorias de convênio — Confluir" }

export default async function CategoriasConvenioPage() {
  await requirePermissao("filiacao_convenios", ["filiacao_gestao"])
  const categorias = await listarCategoriasConvenio()

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/filiados/convenios">
            <ArrowLeft />
            Convênios
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Categorias de convênio</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          É como o filiado procura no portal: ótica, hospedagem, educação, saúde.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Categorias</CardTitle>
          <CardDescription>
            Renomear vale para todos os convênios da categoria. Só se exclui categoria vazia.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Categorias categorias={categorias} />
        </CardContent>
      </Card>
    </>
  )
}
