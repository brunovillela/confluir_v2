import type { Metadata } from "next"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { requireSessaoHotel } from "@/lib/auth"
import {
  ehGarantida,
  mapaDaNoite,
  processarFilaDeEspera,
} from "@/lib/db/hospedagem-garantida"
import {
  DIAS_SEMANA,
  dataBR,
  diaDaSemana,
  hojeEmSP,
  somarDias,
} from "@/lib/hospedagem-garantida-constantes"

import { HotelShell } from "../hotel-shell"
import { AnotarQuartoForm, ImprimirBotao } from "./formularios"

export const metadata: Metadata = { title: "Hóspedes por quarto — Área do hotel" }

const DATA = /^\d{4}-\d{2}-\d{2}$/

function horaBR(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))
}

export default async function HotelHospedesPage({
  searchParams,
}: {
  searchParams: Promise<{ noite?: string }>
}) {
  const { hotel } = await requireSessaoHotel()
  const { noite: noiteParam } = await searchParams
  const noite = noiteParam && DATA.test(noiteParam) ? noiteParam : hojeEmSP()

  if (!ehGarantida(hotel)) {
    return (
      <HotelShell nomeHotel={hotel.nome ?? "Hotel parceiro"}>
        <h1 className="text-2xl font-semibold tracking-tight">Hóspedes por quarto</h1>
        <Alert>
          <AlertDescription>
            A lista de hóspedes por quarto é do convênio de demanda garantida.
            Neste hotel, o convênio é de pagamento por uso: as reservas estão no
            Início.
          </AlertDescription>
        </Alert>
      </HotelShell>
    )
  }

  try {
    await processarFilaDeEspera(hotel)
  } catch {
    // a lista de espera nunca derruba a tela do hotel
  }
  const mapa = await mapaDaNoite(hotel, noite)
  const hospedes = mapa.quartos.reduce((n, q) => n + q.hospedes.length, 0)

  return (
    <HotelShell nomeHotel={hotel.nome ?? "Hotel parceiro"}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Hóspedes por quarto</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Reservas confirmadas pelo Confluir. O hotel é obrigado a hospedar
            quem está nesta lista. Anote o número do quarto do hotel usado para
            cada quarto do convênio.
          </p>
        </div>
        <ImprimirBotao />
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="outline" size="sm" asChild>
          <Link href={`/hotel/hospedes?noite=${somarDias(noite, -1)}`}>
            <ChevronLeft />
            Noite anterior
          </Link>
        </Button>
        <form method="get" className="flex items-center gap-2">
          <Input type="date" name="noite" defaultValue={noite} className="h-8 w-40" aria-label="Noite" />
          <Button type="submit" size="sm" variant="secondary">
            Ver
          </Button>
        </form>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/hotel/hospedes?noite=${somarDias(noite, 1)}`}>
            Próxima noite
            <ChevronRight />
          </Link>
        </Button>
      </div>

      <p className="text-sm">
        <strong>
          Noite de {DIAS_SEMANA[diaDaSemana(noite)].toLowerCase()}, {dataBR(noite)}
        </strong>{" "}
        · {mapa.totalQuartos} quarto{mapa.totalQuartos === 1 ? "" : "s"} dedicado
        {mapa.totalQuartos === 1 ? "" : "s"} · {hospedes} hóspede
        {hospedes === 1 ? "" : "s"}
      </p>

      {!mapa.instalado && (
        <Alert variant="destructive">
          <AlertDescription>
            A demanda garantida ainda não está instalada no banco. Fale com o
            sindicato.
          </AlertDescription>
        </Alert>
      )}

      {mapa.fora.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            {mapa.fora.length} hóspede(s) estão em quartos além dos dedicados
            nesta noite (a quantidade de quartos mudou depois da reserva):{" "}
            {mapa.fora.map((h) => `${h.nome ?? "—"} (quarto ${h.quarto})`).join(", ")}.
            Fale com o sindicato.
          </AlertDescription>
        </Alert>
      )}

      {mapa.totalQuartos === 0 ? (
        <p className="text-muted-foreground text-sm">
          Nenhum quarto dedicado ao convênio nesta noite.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 print:grid-cols-2">
          {mapa.quartos.map((q) => (
            <Card key={q.quarto} className="break-inside-avoid">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    Quarto {q.quarto} do convênio
                    {q.quartoHotel ? ` · quarto ${q.quartoHotel} do hotel` : ""}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {q.sexo && <Badge variant="secondary">{q.sexo}</Badge>}
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {q.hospedes.length}/{q.vagas} vagas
                    </span>
                  </div>
                </div>
                <CardDescription>
                  <AnotarQuartoForm noite={noite} quarto={q.quarto} atual={q.quartoHotel} />
                </CardDescription>
              </CardHeader>
              <CardContent>
                {q.hospedes.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Quarto vazio.</p>
                ) : (
                  <ul className="grid gap-2">
                    {q.hospedes.map((h) => (
                      <li key={h.cupomId} className="rounded-md border px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{h.nome ?? "—"}</span>
                          {h.presencaEm ? (
                            <Badge variant="success">entrou às {horaBR(h.presencaEm)}</Badge>
                          ) : h.aguardandoConfirmacao ? (
                            <Badge variant="outline">vaga não confirmada</Badge>
                          ) : (
                            <Badge variant="outline">aguardando chegada</Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground text-xs tabular-nums">
                          CPF {h.cpfMascarado} · estadia de {dataBR(h.checkIn)} a{" "}
                          {dataBR(h.checkOut)}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </HotelShell>
  )
}
