import type { Metadata } from "next"
import { Sparkles } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requireSessaoPainel } from "@/lib/auth"
import { formatarData } from "@/lib/formato"
import { NOVIDADES } from "@/lib/novidades"

export const metadata: Metadata = { title: "O que há de novo — Confluir" }

export default async function NovidadesPage() {
  await requireSessaoPainel()
  return (
    <>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">O que há de novo</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          O que mudou no Confluir a cada entrega, da mais recente para a mais antiga.
        </p>
      </div>

      {NOVIDADES.map((n) => (
        <Card key={n.id}>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-baseline gap-x-3 text-base">
              {n.titulo}
              <span className="text-muted-foreground text-xs font-normal">{formatarData(n.id)}</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              {n.itens.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ))}
    </>
  )
}
