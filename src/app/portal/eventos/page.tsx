import type { Metadata } from "next"
import Link from "next/link"
import { CalendarDays, MapPin, Users } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { eventosParaFiliado } from "@/lib/db/eventos-portal"
import { formatarDataHora } from "@/lib/formato"
import { tenantAtual } from "@/lib/tenant"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"

import { PortalShell } from "../portal-shell"
import { CancelarInscricao, Inscrever, ResponderRsvp } from "./formularios"

export const metadata: Metadata = { title: "Eventos — Portal do Associado" }

const ROTULO: Record<string, string> = {
  pendente: "aguardando avaliação",
  confirmada: "inscrição confirmada",
  lista_espera: "lista de espera",
  recusada: "não aprovada",
  cancelada: "cancelada",
}

export default async function PortalEventosPage() {
  const { filiado, preview, gestorNome } = await requireVisualizacaoPortal()
  const lista = await eventosParaFiliado(filiado.cpf, await tenantAtual())

  return (
    <PortalShell
      preview={
        preview
          ? { filiadoNome: filiado.nome_completo, gestorNome }
          : undefined
      }
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Eventos</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Inscreva-se, avise se vai comparecer e acompanhe suas inscrições.
        </p>
      </div>

      {lista.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center">
            <CalendarDays className="size-6" />
            <p className="text-sm">
              Nenhum evento com inscrição aberta no momento.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {lista.map((e) => {
            const cancelada =
              e.situacao === "cancelada" || e.situacao === "recusada"
            const confirmada = e.situacao === "confirmada"

            return (
              <Card key={e.evento.id}>
                <CardContent className="grid gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-lg font-medium">
                        {e.evento.titulo ?? "(sem título)"}
                      </h2>
                      <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                        <span className="flex items-center gap-1.5">
                          <CalendarDays className="size-3.5" />
                          {formatarDataHora(e.evento.inicio)}
                        </span>
                        {e.evento.local && (
                          <span className="flex items-center gap-1.5">
                            <MapPin className="size-3.5" />
                            {e.evento.local}
                          </span>
                        )}
                      </p>
                    </div>
                    {e.inscrito && e.situacao && (
                      <Badge
                        variant={
                          confirmada
                            ? "success"
                            : cancelada
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {ROTULO[e.situacao] ?? e.situacao}
                      </Badge>
                    )}
                  </div>

                  {e.evento.descricao && (
                    <p className="text-sm">{e.evento.descricao}</p>
                  )}

                  {e.evento.situacao === "adiado" && (
                    <Alert variant="warning">
                      <AlertDescription>
                        Este evento foi adiado.{" "}
                        {e.evento.motivo_situacao ?? ""} Sua inscrição continua
                        valendo.
                      </AlertDescription>
                    </Alert>
                  )}

                  {e.presencas > 0 && (
                    <Alert variant="success">
                      <AlertDescription>
                        Sua presença foi registrada. Obrigado por comparecer.
                      </AlertDescription>
                    </Alert>
                  )}

                  {/* Não inscrito: o convite. */}
                  {!e.inscrito &&
                    (e.aberta ? (
                      <AcaoVisualizacao
                        preview={preview}
                        nota="Somente o próprio associado pode se inscrever."
                      >
                        <Inscrever eventoId={e.evento.id} />
                      </AcaoVisualizacao>
                    ) : (
                      <p className="text-muted-foreground text-sm">
                        {e.motivoFechada ?? "As inscrições estão fechadas."}
                      </p>
                    ))}

                  {!e.inscrito && e.aberta && e.vagasRestantes !== null && (
                    <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <Users className="size-3.5" />
                      {e.vagasRestantes} vaga(s) disponível(is)
                    </p>
                  )}

                  {/* Inscrito e confirmado: o RSVP e o link da inscrição. */}
                  {e.inscrito && confirmada && (
                    <div className="grid gap-3 border-t pt-4">
                      {e.evento.exige_rsvp &&
                        (e.rsvpAberto ? (
                          <AcaoVisualizacao
                            preview={preview}
                            nota="A resposta é do associado — a gestão não responde por ele."
                          >
                            <ResponderRsvp
                              token={e.inscricaoToken ?? ""}
                              resposta={e.rsvpConfirmado}
                            />
                          </AcaoVisualizacao>
                        ) : (
                          <p className="text-sm">
                            Perto do evento vamos perguntar se você conseguiu se
                            organizar para vir
                            {e.evento.rsvp_abre_em
                              ? ` — a partir de ${formatarDataHora(e.evento.rsvp_abre_em)}`
                              : ""}
                            . Sua inscrição já está garantida.
                          </p>
                        ))}

                      <div className="flex flex-wrap items-center gap-4">
                        {e.inscricaoToken && (
                          <Link
                            href={`/inscricao/${e.inscricaoToken}`}
                            className="text-sm underline"
                          >
                            Ver meu código de entrada
                          </Link>
                        )}
                        {e.presencas === 0 && e.inscricaoId && (
                          <AcaoVisualizacao preview={preview} nota="">
                            <CancelarInscricao inscricaoId={e.inscricaoId} />
                          </AcaoVisualizacao>
                        )}
                      </div>
                    </div>
                  )}

                  {e.inscrito && e.situacao === "pendente" && (
                    <p className="text-muted-foreground border-t pt-4 text-sm">
                      Sua inscrição está na fila de avaliação. Avisamos por
                      e-mail assim que houver resposta.
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </PortalShell>
  )
}
