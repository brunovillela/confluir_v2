import type { Metadata } from "next"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { requirePermissao } from "@/lib/auth"
import { opcoesNovoCongresso } from "@/lib/db/congressos"

import { NovoCongressoForm } from "../formularios"

export const metadata: Metadata = { title: "Novo congresso — Confluir" }

export default async function NovoCongressoPage() {
  await requirePermissao("congressos_gestao")
  const { eventos, congressos } = await opcoesNovoCongresso()
  return (
    <>
      <RotuloTrilha valores={{ congressos: "Congressos", novo: "Novo" }} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Novo congresso</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Comece pela edição anterior ou por um modelo. Tudo pode ser ajustado depois, na configuração.
        </p>
      </div>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Dados e ponto de partida</CardTitle>
          <CardDescription>O congresso nasce em preparação; nada fica público por aqui.</CardDescription>
        </CardHeader>
        <CardContent>
          <NovoCongressoForm eventos={eventos} congressos={congressos} />
        </CardContent>
      </Card>
    </>
  )
}
