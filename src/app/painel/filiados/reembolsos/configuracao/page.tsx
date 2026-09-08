import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { configReembolsoCompleta } from "@/lib/db/filiacao-reembolsos-edicao"
import { listarCentrosCusto } from "@/lib/db/financeiro"

import { ConfigForm } from "./config-form"

export const metadata: Metadata = { title: "Configuração de reembolsos — Confluir" }

export default async function ConfiguracaoReembolsosPage() {
  await requirePermissao("filiacao_reembolsos", ["filiacao_gestao"])
  const [config, centros] = await Promise.all([configReembolsoCompleta(), listarCentrosCusto()])

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/filiados/reembolsos">
            <ArrowLeft />
            Reembolsos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Configuração de reembolsos</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          A regra da entidade: quanto vale cada reembolso, de onde sai o dinheiro e o teto do mês.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Regra</CardTitle>
          <CardDescription>Vale para os próximos lançamentos; os já feitos não mudam.</CardDescription>
        </CardHeader>
        <CardContent>
          <ConfigForm
            config={config}
            centros={centros
              .filter((c) => c.usavel !== false)
              .map((c) => ({
                id: c.id,
                nome: [c.classificador, c.nome_da_conta].filter(Boolean).join(" — "),
              }))}
          />
        </CardContent>
      </Card>
    </>
  )
}
