import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { AVISO_SQL_FALTAS, lerConfigFaltas } from "@/lib/db/faltas"

import { ConfigFaltasForm } from "../faltas-forms"

export const metadata: Metadata = { title: "Configurações das faltas — Confluir" }

export default async function ConfigFaltasPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_faltas_justificadas"])
  const { salvo } = await searchParams
  const { disponivel, config } = await lerConfigFaltas()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/faltas">
            <ArrowLeft />
            Faltas justificadas
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Configurações das faltas justificadas</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Quantas faltas justificadas cada funcionário pode ter e quais justificativas o acordo aceita.
        </p>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>{AVISO_SQL_FALTAS}</AlertDescription>
        </Alert>
      )}
      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Configurações salvas.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Limites e justificativas</CardTitle>
          <CardDescription>
            Valem para o pedido do funcionário no Meu perfil e para o lançamento do departamento (que
            pode registrar acima do limite, marcando a opção).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ConfigFaltasForm config={config} />
        </CardContent>
      </Card>
    </>
  )
}
