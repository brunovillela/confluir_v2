import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { listarUnidades, obterCongresso } from "@/lib/db/congressos"
import { participantePeloLink, regrasDasMocoes } from "@/lib/db/congressos-mocoes"
import { tenantAtual } from "@/lib/tenant"

import { NovaMocaoLink } from "./nova-mocao-link"

export const metadata: Metadata = { title: "Apresentar moção — Confluir", robots: { index: false }, referrer: "no-referrer" }

export default async function NovaMocaoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const tenantId = await tenantAtual()
  const p = await participantePeloLink(token, tenantId)
  if (!p) notFound()
  const c = await obterCongresso(p.congressoId)
  if (!c) notFound()
  const regras = regrasDasMocoes(c)
  const unidades = await listarUnidades(c.id)
  const pode = regras.quemApresenta === "participantes" && p.propoe

  return (
    <main className="mx-auto grid w-full max-w-2xl gap-4 px-4 py-6">
      <Link href={`/congresso/eu/${token}`} className="text-muted-foreground inline-flex items-center gap-1 text-sm">
        <ArrowLeft className="size-4" />
        Minha participação
      </Link>
      <Card>
        <CardHeader>
          <CardTitle>Apresentar moção</CardTitle>
        </CardHeader>
        <CardContent>
          {pode ? (
            <NovaMocaoLink token={token} tipos={regras.tipos} bases={unidades.map((u) => ({ id: u.id, nome: u.nome }))} baseInicial={p.unidadeId} />
          ) : (
            <p className="text-sm">
              {regras.quemApresenta !== "participantes"
                ? "Neste congresso, as moções são registradas pela comissão organizadora. Procure a mesa."
                : "O seu papel no congresso não apresenta moções."}
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  )
}
