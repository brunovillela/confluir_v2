import type { Metadata } from "next"
import { CalendarDays } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { requireSessaoPortal } from "@/lib/auth"
import { eventosDoAplicativo } from "@/lib/db/filiado-portal"
import { formatarData, formatarDataHora } from "@/lib/formato"

import { PortalShell } from "../portal-shell"

export const metadata: Metadata = { title: "Agenda — Portal do Associado" }

export default async function PortalAgendaPage() {
  await requireSessaoPortal()
  const eventos = await eventosDoAplicativo(50)

  return (
    <PortalShell>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Agenda</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Eventos e atividades do sindicato abertos aos associados.
        </p>
      </div>

      <Card>
        <CardContent>
          {eventos.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center">
              <CalendarDays className="size-6" />
              <p className="text-sm">Nenhum evento programado no momento.</p>
            </div>
          ) : (
            <ul className="divide-y">
              {eventos.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {e.atividade ?? "(sem título)"}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {e.dia_todo === true
                        ? `${formatarData(e.inicio)} — dia todo`
                        : `${formatarDataHora(e.inicio)}${e.termino ? ` até ${formatarDataHora(e.termino)}` : ""}`}
                      {e.local ? ` · ${e.local}` : ""}
                    </p>
                  </div>
                  {e.tipo && (
                    <Badge variant="outline" className="text-muted-foreground shrink-0">
                      {e.tipo}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PortalShell>
  )
}
