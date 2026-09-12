import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { requirePermissao } from "@/lib/auth"
import { listarHoteis } from "@/lib/db/hospedagem"
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
import { podeAcessar } from "@/lib/permissoes"

import { CancelarReservaEquipe, RemanejarForm } from "./formularios"

export const metadata: Metadata = { title: "Mapa de hóspedes — Confluir" }

const DATA = /^\d{4}-\d{2}-\d{2}$/
const SELECT =
  "border-input bg-background text-foreground h-8 rounded-md border px-2 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export default async function MapaHospedesPage({
  searchParams,
}: {
  searchParams: Promise<{ hotel?: string; noite?: string; salvo?: string }>
}) {
  const sessao = await requirePermissao("filiacao_hospedagens", [
    "filiacao_hospedagens_gestao",
    "filiacao_hospedagens_edicao",
  ])
  const podeGerir = podeAcessar(sessao.permissoes, "filiacao_hospedagens_gestao")
  const sp = await searchParams

  const hoteis = (await listarHoteis()).filter(ehGarantida)
  const hotel = hoteis.find((h) => h.id === sp.hotel) ?? hoteis[0]
  const noite = sp.noite && DATA.test(sp.noite) ? sp.noite : hojeEmSP()

  const cabecalho = (
    <div>
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
        <Link href="/painel/hospedagem">
          <ArrowLeft />
          Hospedagem
        </Link>
      </Button>
      <h1 className="text-2xl font-semibold tracking-tight">Mapa de hóspedes</h1>
      <p className="text-muted-foreground mt-1 text-xs">
        Hotéis de demanda garantida: quem está em cada quarto do convênio, noite
        a noite. A equipe pode remanejar hóspedes e cancelar reservas.
      </p>
    </div>
  )

  if (!hotel) {
    return (
      <>
        {cabecalho}
        <Alert>
          <AlertDescription>
            Nenhum hotel de demanda garantida. Configure em{" "}
            <Link href="/painel/hospedagem/hoteis" className="underline">
              Hotéis parceiros
            </Link>
            , no tipo de convênio.
          </AlertDescription>
        </Alert>
      </>
    )
  }

  try {
    await processarFilaDeEspera(hotel)
  } catch {
    // a lista de espera nunca derruba o mapa
  }
  const mapa = await mapaDaNoite(hotel, noite)
  const hospedes = mapa.quartos.reduce((n, q) => n + q.hospedes.length, 0)
  const base = `/painel/hospedagem/mapa?hotel=${hotel.id}`

  return (
    <>
      {cabecalho}

      {sp.salvo === "1" && (
        <Alert variant="success">
          <AlertDescription>Reserva criada e quarto definido.</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <form method="get" className="flex flex-wrap items-center gap-2">
          <select name="hotel" defaultValue={hotel.id} className={SELECT} aria-label="Hotel">
            {hoteis.map((h) => (
              <option key={h.id} value={h.id}>
                {h.nome ?? "(sem nome)"}
              </option>
            ))}
          </select>
          <Input type="date" name="noite" defaultValue={noite} className="h-8 w-40" aria-label="Noite" />
          <Button type="submit" size="sm" variant="secondary">
            Ver
          </Button>
        </form>
        <Button variant="outline" size="sm" asChild>
          <Link href={`${base}&noite=${somarDias(noite, -1)}`}>
            <ChevronLeft />
            Anterior
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link href={`${base}&noite=${somarDias(noite, 1)}`}>
            Próxima
            <ChevronRight />
          </Link>
        </Button>
      </div>

      <p className="text-sm">
        <strong>
          {DIAS_SEMANA[diaDaSemana(noite)]}, {dataBR(noite)}
        </strong>{" "}
        · {mapa.totalQuartos} quarto(s) dedicado(s) · {hospedes} hóspede(s)
      </p>

      {!mapa.instalado && (
        <Alert variant="destructive">
          <AlertDescription>
            Rode supabase/hospedagem-demanda-garantida.sql no Supabase.
          </AlertDescription>
        </Alert>
      )}
      {mapa.fora.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            Hóspedes em quartos além dos dedicados nesta noite (os quartos do dia
            diminuíram depois da reserva) — remaneje:{" "}
            {mapa.fora.map((h) => `${h.nome ?? "—"} (quarto ${h.quarto})`).join(", ")}.
          </AlertDescription>
        </Alert>
      )}

      {mapa.totalQuartos === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhum quarto dedicado nesta noite.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {mapa.quartos.map((q) => (
            <Card key={q.quarto}>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">
                    Quarto {q.quarto}
                    {q.quartoHotel ? ` · ${q.quartoHotel} no hotel` : ""}
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {q.sexo && <Badge variant="secondary">{q.sexo}</Badge>}
                    <span className="text-muted-foreground text-xs tabular-nums">
                      {q.hospedes.length}/{q.vagas} vagas
                    </span>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {q.hospedes.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Quarto vazio.</p>
                ) : (
                  <ul className="grid gap-2">
                    {q.hospedes.map((h) => (
                      <li key={h.cupomId} className="grid gap-2 rounded-md border px-3 py-2 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">{h.nome ?? "—"}</span>
                          {h.presencaEm ? (
                            <Badge variant="success">entrou</Badge>
                          ) : h.aguardandoConfirmacao ? (
                            <Badge variant="warning">vaga oferecida, sem confirmação</Badge>
                          ) : (
                            <Badge variant="outline">aguardando chegada</Badge>
                          )}
                        </div>
                        <p className="text-muted-foreground text-xs tabular-nums">
                          CPF {h.cpfMascarado} · {dataBR(h.checkIn)} a {dataBR(h.checkOut)}
                        </p>
                        {podeGerir && !h.presencaEm && (
                          <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                            <RemanejarForm
                              cupomId={h.cupomId}
                              quartoAtual={q.quarto}
                              totalQuartos={mapa.totalQuartos}
                            />
                            <CancelarReservaEquipe cupomId={h.cupomId} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
