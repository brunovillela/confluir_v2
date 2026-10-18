import { CalendarDays, CalendarPlus } from "lucide-react"

import { EstadoVazio } from "@/components/portal/estado-vazio"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import type { EventoAgenda } from "@/lib/db/filiado-portal"
import { formatarData, formatarDataHora } from "@/lib/formato"

/** O evento espelhado num compromisso da agenda (A85), como Eventos o mostra. */
type EventoDoItem = { evento: { id: string }; inscrito: boolean; aberta: boolean }

/**
 * A lista da agenda de atividades: no fim de Eventos (seção id="agenda") e,
 * com Eventos desabilitada em Filiados › Área do associado, sozinha em
 * /portal/agenda — lá sem o atalho para o cartão do evento nem o
 * "Calendário", que moram sob /portal/eventos.
 */
export function AgendaDeAtividades({
  agenda,
  eventoDoItem,
  comCalendario = true,
}: {
  agenda: EventoAgenda[]
  /** Compromisso espelhado de um evento → o cartão dele na mesma página. */
  eventoDoItem?: Map<string, EventoDoItem>
  /** "Adicionar ao calendário" (/portal/eventos/agenda/<id>/calendario). */
  comCalendario?: boolean
}) {
  return (
    <Card>
      <CardContent>
        {agenda.length === 0 ? (
          <EstadoVazio icone={CalendarDays} titulo="Nenhuma atividade programada no momento." />
        ) : (
          <ul className="divide-y">
            {agenda.map((a) => {
              // A85: compromisso espelhado de um evento leva ao cartão dele.
              const ev = eventoDoItem?.get(a.id)
              return (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.atividade ?? "(sem título)"}</p>
                    <p className="text-muted-foreground text-xs">
                      {a.dia_todo === true
                        ? `${formatarData(a.inicio)} — dia todo`
                        : `${formatarDataHora(a.inicio)}${a.termino ? ` até ${formatarDataHora(a.termino)}` : ""}`}
                      {a.local ? ` · ${a.local}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {a.tipo && (
                      <Badge variant="outline" className="text-muted-foreground shrink-0">
                        {a.tipo}
                      </Badge>
                    )}
                    {ev && (
                      <Button asChild variant={ev.aberta && !ev.inscrito ? "default" : "outline"}>
                        <a href={`#evento-${ev.evento.id}`}>
                          {ev.inscrito
                            ? "Ver minha inscrição"
                            : ev.aberta
                              ? "Inscrever-se"
                              : "Ver evento"}
                        </a>
                      </Button>
                    )}
                    {comCalendario && a.inicio && (
                      <Button asChild variant="outline">
                        <a
                          href={`/portal/eventos/agenda/${a.id}/calendario`}
                          aria-label={`Adicionar ao calendário: ${a.atividade ?? "atividade"}`}
                          title="Adicionar ao calendário"
                        >
                          <CalendarPlus />
                          <span className="hidden sm:inline">Calendário</span>
                        </a>
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
