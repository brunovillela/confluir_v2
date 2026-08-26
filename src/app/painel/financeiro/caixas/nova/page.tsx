import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { pessoasAutorizaveis } from "@/lib/db/caixa"
import { podeAcessar } from "@/lib/permissoes"

import { NovaContaForm } from "../caixa-forms"

export const metadata: Metadata = { title: "Nova conta de caixa — Confluir" }

export default async function NovaContaPage() {
  const sessao = await requirePermissao("financeiro_caixa", [
    "financeiro_caixa_admin",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "financeiro_caixa", [
    "financeiro_caixa_admin",
  ])

  const pessoas = await pessoasAutorizaveis()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/financeiro/caixas">
            <ArrowLeft />
            Contas de caixa
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Nova conta de caixa
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Autoriza um funcionário ou diretor a ter dinheiro em espécie para
          compras do dia a dia.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da conta</CardTitle>
          <CardDescription>
            A conta nasce fechada — abre quando o responsável confirmar o
            recebimento do primeiro aporte.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NovaContaForm pessoas={pessoas} podeEditar={podeEditar} />
        </CardContent>
      </Card>
    </>
  )
}
