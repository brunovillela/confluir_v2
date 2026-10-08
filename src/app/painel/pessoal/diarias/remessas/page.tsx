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
  const aAvaliar = remessas.filter((r) => !r.enviada && r.situacao !== "devolvida")
  const devolvidas = remessas.filter((r) => !r.enviada && r.situacao === "devolvida")
  const aprovadas = remessas.filter((r) => r.enviada)
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
          Cada funcionário tem uma remessa que acumula as diárias lançadas. A avaliação é da remessa
          inteira: aprovada, vira uma ordem de pagamento com o valor dela, rateada pelos centros de
          custo; com não conformidade, volta a quem lançou com a observação.
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
          <CardTitle className="text-base">Em avaliação ({aAvaliar.length})</CardTitle>
          <CardDescription>Abertas e reenviadas depois de corrigidas — aprove ou devolva cada remessa</CardDescription>
        </CardHeader>
        <CardContent>
          <ListaRemessasDiarias remessas={aAvaliar} base={base} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Devolvidas ({devolvidas.length})</CardTitle>
          <CardDescription>Aguardando a correção de quem lançou</CardDescription>
        </CardHeader>
        <CardContent>
          <ListaRemessasDiarias remessas={devolvidas} base={base} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aprovadas ({aprovadas.length})</CardTitle>
          <CardDescription>Com a ordem de pagamento gerada</CardDescription>
        </CardHeader>
        <CardContent>
          <ListaRemessasDiarias remessas={aprovadas} base={base} />
        </CardContent>
      </Card>
    </>
  )
}
