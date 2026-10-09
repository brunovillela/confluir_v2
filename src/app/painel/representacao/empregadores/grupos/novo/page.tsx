import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { AVISO_SQL_GRUPOS, gruposPorFonte, listarGrupos } from "@/lib/db/grupos-empresariais"

import { GrupoForm } from "../grupo-forms"

export const metadata: Metadata = { title: "Novo grupo empresarial — Confluir" }

export default async function NovoGrupoPage() {
  await requirePermissao("empregadores")
  const [{ esquemaPronto }, fontes, porFonte] = await Promise.all([
    listarGrupos(),
    listarFontesPagadoras(),
    gruposPorFonte(),
  ])
  const livres = fontes
    .filter((f) => f.inativa !== true && !porFonte.has(f.id))
    .map((f) => ({ id: f.id, nome: f.nome_fantasia ?? f.nome_razao ?? "(sem nome)" }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao/empregadores/grupos">
            <ArrowLeft />
            Grupos empresariais
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Novo grupo empresarial</h1>
      </div>
      {!esquemaPronto ? (
        <Alert variant="warning">
          <AlertDescription>{AVISO_SQL_GRUPOS}</AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardContent>
            <GrupoForm livres={livres} aoCancelarHref="/painel/representacao/empregadores/grupos" />
          </CardContent>
        </Card>
      )}
    </>
  )
}
