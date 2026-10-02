import Link from "next/link"
import { Star } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { PendenciaAvaliacao } from "@/lib/db/hospedagem-avaliacoes"
import { dataBR } from "@/lib/hospedagem-garantida-constantes"

/**
 * "Avalie sua hospedagem" — como o Uber, a avaliação reaparece até ser feita
 * e trava um novo pedido. Cada estrela já abre a avaliação com a nota marcada.
 * No "ver como filiado" da gestão, sem links: quem avalia é o filiado.
 */
export function AvaliacoesPendentes({
  pendencias,
  preview = false,
}: {
  pendencias: PendenciaAvaliacao[]
  preview?: boolean
}) {
  if (!pendencias.length) return null
  return (
    <Card className="border-primary/40">
      <CardHeader>
        <CardTitle className="text-base">Avalie sua hospedagem</CardTitle>
        <CardDescription>
          Leva menos de um minuto. Enquanto a avaliação estiver pendente, um novo pedido de
          hospedagem fica aguardando. O hotel vê a nota sem o seu nome.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {pendencias.map((p) => (
          <div key={p.token} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{p.hotelNome ?? "Hotel parceiro"}</p>
              <p className="text-muted-foreground text-xs">
                {p.checkIn ? `${dataBR(p.checkIn)} a ${dataBR(p.checkOut)}` : `check-out em ${dataBR(p.checkOut)}`}
              </p>
            </div>
            <div className="flex items-center gap-0.5" aria-label="Escolha a nota">
              {[1, 2, 3, 4, 5].map((n) =>
                preview ? (
                  <Star key={n} className="text-muted-foreground/40 size-7" />
                ) : (
                  <Link
                    key={n}
                    href={`/hospedagem/avaliar/${p.token}?nota=${n}`}
                    aria-label={`${n} estrela${n === 1 ? "" : "s"}`}
                    className="group rounded p-0.5"
                  >
                    <Star className="text-muted-foreground/50 group-hover:fill-primary group-hover:text-primary size-7 transition-colors" />
                  </Link>
                )
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
