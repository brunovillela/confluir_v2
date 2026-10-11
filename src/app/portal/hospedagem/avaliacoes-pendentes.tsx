import Link from "next/link"
import { Star } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { PendenciaAvaliacao } from "@/lib/db/hospedagem-avaliacoes"
import { ROTULO_NOTA } from "@/lib/hospedagem-avaliacoes-constantes"
import { dataBR } from "@/lib/hospedagem-garantida-constantes"

/**
 * Cada estrela: 32 px no mouse, 44 px no toque (A119). Com 2 px entre elas,
 * as cinco cabem numa tela de 320 px sem cortar a última.
 */
const ESTRELA = "rounded-md p-0.5 pointer-coarse:p-2"

/**
 * "Avalie sua hospedagem" — como o Uber, a avaliação reaparece até ser feita
 * e trava um novo pedido. Cada estrela já abre a avaliação com a nota marcada
 * — são links, não uma escolha guardada aqui, por isso um grupo rotulado e não
 * um radiogroup. No "ver como filiado" da gestão, sem links: quem avalia é o
 * filiado.
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
            <div
              role={preview ? undefined : "group"}
              aria-label={preview ? undefined : `Sua nota para ${p.hotelNome ?? "o hotel parceiro"}`}
              aria-hidden={preview || undefined}
              className="flex items-center gap-0.5"
            >
              {[1, 2, 3, 4, 5].map((n) =>
                preview ? (
                  <span key={n} className={ESTRELA}>
                    <Star aria-hidden className="text-muted-foreground/40 size-7" />
                  </span>
                ) : (
                  <Link
                    key={n}
                    href={`/hospedagem/avaliar/${p.token}?nota=${n}`}
                    aria-label={`${n} estrela${n === 1 ? "" : "s"} — ${ROTULO_NOTA[n]}`}
                    className={`group ${ESTRELA} outline-none focus-visible:ring-3 focus-visible:ring-ring/50`}
                  >
                    <Star
                      aria-hidden
                      className="text-muted-foreground/50 group-hover:fill-primary group-hover:text-primary group-focus-visible:text-primary size-7 transition-colors"
                    />
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
