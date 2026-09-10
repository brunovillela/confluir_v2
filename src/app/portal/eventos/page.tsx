import type { Metadata } from "next"
import Link from "next/link"
import { CalendarDays, MapPin, Sparkles, Users } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { eventosDoAplicativo } from "@/lib/db/filiado-portal"
import { eventosParaFiliado, type EventoDoFiliado } from "@/lib/db/eventos-portal"
import { formatarData, formatarDataHora } from "@/lib/formato"
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

/**
 * Eventos e agenda numa página só (decisão do Bruno, 10/09/2026): primeiro,
 * em destaque, os eventos com INSCRIÇÕES ABERTAS; depois as inscrições que o
 * associado já tem; por fim a agenda de atividades do sindicato.
 */
export default async function PortalEventosPage() {
  const { filiado, preview, gestorNome } = await requireVisualizacaoPortal()
  const [lista, agenda] = await Promise.all([
    eventosParaFiliado(filiado.cpf, await tenantAtual()),
    eventosDoAplicativo(50),
  ])
  const abertos = lista.filter((e) => e.aberta && !e.inscrito)
  const minhas = lista.filter((e) => e.inscrito)
  const fechados = lista.filter((e) => !e.aberta && !e.inscrito)

  return (
    <PortalShell
      preview={
        preview
          ? { filiadoNome: filiado.nome_completo, gestorNome }
          : undefined
      }
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Eventos e agenda</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Inscreva-se nos eventos abertos, acompanhe suas inscrições e veja a
          agenda de atividades do sindicato.
        </p>
      </div>

      {/* ── Inscrições abertas: o destaque da página ─────────────────── */}
      <section aria-label="Inscrições abertas" className="grid gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Sparkles className="text-primary size-5" />
          Inscrições abertas
          {abertos.length > 0 && (
            <Badge className="ml-1">{abertos.length}</Badge>
          )}
        </h2>
        {abertos.length === 0 ? (
          <Card>
            <CardContent className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center">
              <CalendarDays className="size-6" />
              <p className="text-sm">Nenhum evento com inscrição aberta no momento.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {abertos.map((e) => (
              <Card
                key={e.evento.id}
                className="border-primary/50 bg-primary/5 shadow-md ring-1 ring-primary/20"
              >
                <CardContent className="grid gap-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <Badge variant="success">Inscrições abertas</Badge>
                    {e.vagasRestantes !== null && (
                      <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                        <Users className="size-3.5" />
                        {e.vagasRestantes} vaga(s)
                      </span>
                    )}
                  </div>
                  <CabecalhoEvento e={e} />
                  {e.evento.descricao && (
                    <p className="line-clamp-3 text-sm">{e.evento.descricao}</p>
                  )}
                  <AcaoVisualizacao
                    preview={preview}
                    nota="Somente o próprio associado pode se inscrever."
                  >
                    <Inscrever eventoId={e.evento.id} />
                  </AcaoVisualizacao>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ── Minhas inscrições ────────────────────────────────────────── */}
      {minhas.length > 0 && (
        <section aria-label="Minhas inscrições" className="grid gap-3">
          <h2 className="text-lg font-semibold">Minhas inscrições</h2>
          <div className="grid gap-4">
            {minhas.map((e) => {
              const cancelada = e.situacao === "cancelada" || e.situacao === "recusada"
              const confirmada = e.situacao === "confirmada"
              return (
                <Card key={e.evento.id}>
                  <CardContent className="grid gap-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <CabecalhoEvento e={e} />
                      {e.situacao && (
                        <Badge
                          variant={confirmada ? "success" : cancelada ? "destructive" : "secondary"}
                        >
                          {ROTULO[e.situacao] ?? e.situacao}
                        </Badge>
                      )}
                    </div>

                    {e.evento.situacao === "adiado" && (
                      <Alert variant="warning">
                        <AlertDescription>
                          Este evento foi adiado. {e.evento.motivo_situacao ?? ""} Sua
                          inscrição continua valendo.
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

                    {confirmada && (
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
                              Perto do evento vamos perguntar se você conseguiu se organizar
                              para vir
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
                    {e.situacao === "pendente" && (
                      <p className="text-muted-foreground border-t pt-4 text-sm">
                        Sua inscrição está na fila de avaliação. Avisamos por e-mail assim
                        que houver resposta.
                      </p>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Outros eventos publicados, sem inscrição aberta ──────────── */}
      {fechados.length > 0 && (
        <section aria-label="Outros eventos" className="grid gap-3">
          <h2 className="text-lg font-semibold">Outros eventos</h2>
          <Card>
            <CardContent>
              <ul className="divide-y">
                {fechados.map((e) => (
                  <li key={e.evento.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <CabecalhoEvento e={e} compacto />
                    <span className="text-muted-foreground text-xs">
                      {e.motivoFechada ?? "Inscrições fechadas"}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── Agenda de atividades ─────────────────────────────────────── */}
      <section aria-label="Agenda" className="grid gap-3">
        <h2 className="text-lg font-semibold">Agenda de atividades</h2>
        <Card>
          <CardContent>
            {agenda.length === 0 ? (
              <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center">
                <CalendarDays className="size-6" />
                <p className="text-sm">Nenhuma atividade programada no momento.</p>
              </div>
            ) : (
              <ul className="divide-y">
                {agenda.map((a) => (
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
                    {a.tipo && (
                      <Badge variant="outline" className="text-muted-foreground shrink-0">
                        {a.tipo}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </section>
    </PortalShell>
  )
}

function CabecalhoEvento({ e, compacto = false }: { e: EventoDoFiliado; compacto?: boolean }) {
  return (
    <div className="min-w-0">
      <h3 className={compacto ? "truncate font-medium" : "text-lg font-medium"}>
        {e.evento.titulo ?? "(sem título)"}
      </h3>
      <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
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
  )
}
