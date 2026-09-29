import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { opcoesNegociacao } from "@/lib/db/negociacoes"

import { NegociacaoForm } from "../negociacao-forms"

export const metadata: Metadata = { title: "Nova negociação — Confluir" }

export default async function NovaNegociacaoPage() {
  await requirePermissao("negociacoes")
  const opcoes = await opcoesNegociacao()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao/negociacoes">
            <ArrowLeft />
            Negociações sindicais
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Nova negociação</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da negociação</CardTitle>
        </CardHeader>
        <CardContent>
          <NegociacaoForm opcoes={opcoes} aoCancelarHref="/painel/representacao/negociacoes" />
        </CardContent>
      </Card>
    </>
  )
}
