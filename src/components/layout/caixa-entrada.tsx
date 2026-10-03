import Link from "next/link"
import { ArrowRight, Inbox } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { Pendencia } from "@/lib/db/pendencias"

/**
 * Cartão da home: tudo que espera a pessoa agir, com contagem e link direto
 * para a fila (onda 2, U1). Sem pendência, uma linha discreta — a ausência
 * também é informação.
 */
export function CaixaDeEntrada({ pendencias }: { pendencias: Pendencia[] }) {
  const total = pendencias.reduce((s, p) => s + p.quantidade, 0)
  return (
    <Card id="caixa-entrada">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Inbox className="text-muted-foreground size-4" />
          Sua caixa de entrada
          {total > 0 && (
            <Badge className="ml-1 tabular-nums">{total > 99 ? "99+" : total}</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {pendencias.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nada esperando por você agora.</p>
        ) : (
          <ul className="divide-y">
            {pendencias.map((p) => (
              <li key={p.chave}>
                <Link
                  href={p.href}
                  className="group flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium group-hover:underline group-hover:underline-offset-4">
                      {p.titulo}
                    </span>
                    <span className="text-muted-foreground block text-xs">{p.descricao}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary" className="tabular-nums">
                      {p.quantidade}
                    </Badge>
                    <ArrowRight className="text-muted-foreground size-4" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
