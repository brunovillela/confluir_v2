import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { ListaRemessasDiarias } from "@/components/diarias-remessas"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarRemessasNovas } from "@/lib/db/diarias-remessas"

export const metadata: Metadata = { title: "Remessas de diárias — Confluir" }

export default async function RemessasDiariasPage() {
  await requirePermissao("pessoal_gestao", ["pessoal_diarias"])
  const { disponivel, remessas } = await listarRemessasNovas({ quadro: "funcionario" })
  const abertas = remessas.filter((r) => !r.enviada)
  const enviadas = remessas.filter((r) => r.enviada)
  const base = "/painel/pessoal/diarias/remessas"
  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/diarias">
            <ArrowLeft />
            Diárias
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Remessas de diárias</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Cada funcionário tem uma remessa aberta que acumula as diárias lançadas; enviada, ela vira
          uma ordem de pagamento com a soma das diárias aprovadas e das despesas.
        </p>
      </div>
      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            Remessas ainda não configuradas — rode supabase/diarias-remessas-autorizacao-custeio.sql.
          </AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Abertas ({abertas.length})</CardTitle>
          <CardDescription>Acumulando diárias — envie quando for a hora de pagar</CardDescription>
        </CardHeader>
        <CardContent>
          <ListaRemessasDiarias remessas={abertas} base={base} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Enviadas ({enviadas.length})</CardTitle>
          <CardDescription>Com a ordem de pagamento gerada</CardDescription>
        </CardHeader>
        <CardContent>
          <ListaRemessasDiarias remessas={enviadas} base={base} />
        </CardContent>
      </Card>
    </>
  )
}
