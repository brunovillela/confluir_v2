import Link from "next/link"

import { Card, CardContent } from "@/components/ui/card"
import type { EventoDoProjeto } from "@/lib/db/projetos"
import { formatarData } from "@/lib/formato"

const ROTULO: Record<string, string> = {
  rascunho: "Rascunho",
  publicado: "Publicado",
  encerrado: "Encerrado",
  cancelado: "Cancelado",
  adiado: "Adiado",
}

/**
 * Eventos do projeto (módulo Eventos), com as inscrições confirmadas. As
 * viagens pedidas para eles entram no projeto sozinhas.
 */
export function EventosDoProjeto({ eventos }: { eventos: EventoDoProjeto[] }) {
  if (eventos.length === 0) return null
  return (
    <Card>
      <CardContent>
        <p className="text-sm font-medium">Eventos do projeto</p>
        <p className="text-muted-foreground mb-3 text-xs">
          As viagens pedidas para estes eventos entram no projeto e no gasto dele.
        </p>
        <ul className="divide-y">
          {eventos.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2 text-sm">
              <Link href={`/painel/eventos/${e.id}`} className="text-primary font-medium hover:underline">
                {e.titulo ?? "(sem título)"}
              </Link>
              <span className="text-muted-foreground text-xs">
                {[
                  e.inicio ? formatarData(e.inicio) : null,
                  ROTULO[e.situacao] ?? e.situacao,
                  `${e.confirmadas.toLocaleString("pt-BR")} ${e.confirmadas === 1 ? "inscrição confirmada" : "inscrições confirmadas"}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
