import type { Metadata } from "next"
import Link from "next/link"
import QRCode from "qrcode"
import {
  CalendarDays,
  CalendarPlus,
  Camera,
  ChevronDown,
  Clock,
  ExternalLink,
  History,
  MapPin,
  Maximize2,
  QrCode,
  Sparkles,
  Users,
} from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { eventosDoAplicativo } from "@/lib/db/filiado-portal"
import {
  eventosParaFiliado,
  imagensDosEventos,
  periodoDoEvento,
  type EventoDoFiliado,
} from "@/lib/db/eventos-portal"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"
import { CabecalhoPagina } from "@/components/portal/cabecalho-pagina"
import { EstadoVazio } from "@/components/portal/estado-vazio"

import { itemDoEvento, linkGoogleAgenda } from "./calendario"
import {
  AbrirAncoraRecolhida,
  CancelarInscricao,
  DescricaoEvento,
  Inscrever,
  ResponderRsvp,
} from "./formularios"

export const metadata: Metadata = { title: "Eventos" }

const ROTULO: Record<string, string> = {
  pendente: "aguardando avaliação",
  confirmada: "inscrição confirmada",
  lista_espera: "lista de espera",
  recusada: "não aprovada",
  cancelada: "cancelada",
}

/** Quantos eventos anteriores a seção recolhida mostra (os mais recentes). */
const LIMITE_ANTERIORES = 10

/** Situações em que o próprio associado pode cancelar ou desistir (A81). */
const PODE_DESISTIR = new Set(["confirmada", "pendente", "lista_espera"])

const HORA = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
})

/** Dia do calendário de São Paulo ("2026-10-20"), para comparar datas. */
const DIA_SP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })

/**
 * "20/10/2026 19:00 até 22:00" — ou até outra data, se atravessa dias (A83).
 * O dia é o de São Paulo: `formatarData` de um timestamp lê a data em UTC, e
 * um evento das 19h às 22h "atravessaria" a meia-noite.
 */
function textoPeriodo(p: { inicio: string; termino: string | null }): string {
  const inicio = formatarDataHora(p.inicio)
  if (!p.termino) return inicio
  return DIA_SP.format(new Date(p.inicio)) === DIA_SP.format(new Date(p.termino))
    ? `${inicio} até ${HORA.format(new Date(p.termino))}`
    : `${inicio} até ${formatarDataHora(p.termino)}`
}

/** Abre o aplicativo de mapas no celular; no computador, o Google Maps. */
function linkMapa(endereco: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(endereco)}`
}

/**
 * QR de entrada das inscrições confirmadas (A45) — o mesmo da página pública:
 * carrega o TOKEN, não uma URL, e a recepção lê e busca direto.
 */
async function codigosDeEntrada(lista: EventoDoFiliado[]): Promise<Map<string, string>> {
  const confirmadas = lista.filter(
    (e) => e.situacao === "confirmada" && e.inscricaoToken && e.evento.situacao !== "cancelado"
  )
  const pares = await Promise.all(
    confirmadas.map(
      async (e) =>
        [
          e.evento.id,
          await QRCode.toDataURL(e.inscricaoToken as string, {
            errorCorrectionLevel: "M",
            margin: 1,
            width: 512,
          }),
        ] as const
    )
  )
  return new Map(pares)
}

/**
 * Eventos e agenda numa página só (decisão do Bruno, 10/09/2026): primeiro,
 * em destaque, os eventos com INSCRIÇÕES ABERTAS; depois as inscrições que o
 * associado já tem; os outros eventos ainda por vir; as inscrições em eventos
 * que já passaram, recolhidas; por fim a agenda de atividades do sindicato.
 *
 * Cada evento aparece numa seção só e leva `id="evento-<id>"`: é o destino do
 * aviso de "Inscrição feita", do item da agenda ligado a ele (A85) e do link
 * que vai no calendário.
 */
export default async function PortalEventosPage() {
  const { filiado, preview } = await requireVisualizacaoPortal()
  const [lista, agenda, origem] = await Promise.all([
    eventosParaFiliado(filiado.cpf, await tenantAtual()),
    eventosDoAplicativo(50),
    origemAtual().catch(() => ""),
  ])

  // A135: o que ainda vai acontecer fica à vista; do que já passou, só as
  // inscrições dele, recolhidas e das mais recentes para trás.
  const proximos = lista.filter((e) => !e.passado)
  const abertos = proximos.filter((e) => e.aberta && !e.inscrito)
  const minhas = proximos.filter((e) => e.inscrito)
  const fechados = proximos.filter((e) => !e.aberta && !e.inscrito)
  const todosAnteriores = lista.filter((e) => e.passado && e.inscrito).reverse()
  const anteriores = todosAnteriores.slice(0, LIMITE_ANTERIORES)

  const [imagens, codigos] = await Promise.all([
    imagensDosEventos(abertos.map((e) => e.evento)).catch(() => new Map<string, string>()),
    codigosDeEntrada(minhas),
  ])
  // Agenda → evento (A85): o espelho guarda `eventos.agenda_id`. Só os
  // eventos que a página mostra — rascunho e encerrado não ganham link.
  const porAgenda = new Map(
    proximos
      .filter((e) => e.evento.agenda_id)
      .map((e) => [e.evento.agenda_id as string, e])
  )
  const enderecoNoPortal = (eventoId: string) =>
    origem ? `${origem}/portal/eventos#evento-${eventoId}` : null

  return (
    <>
      <CabecalhoPagina
        secao="/portal/eventos"
        titulo="Eventos e agenda"
        subtitulo="Inscreva-se nos eventos abertos, acompanhe suas inscrições e veja a agenda de atividades do sindicato."
      />

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
          <EstadoVazio cartao icone={CalendarDays} titulo="Nenhum evento com inscrição aberta no momento." />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {abertos.map((e) => {
              const imagem = imagens.get(e.evento.id)
              return (
                <Card
                  key={e.evento.id}
                  id={`evento-${e.evento.id}`}
                  className="border-primary/50 bg-primary/5 ring-primary/20 scroll-mt-20 shadow-md ring-1"
                >
                  <CardContent className="grid gap-4">
                    {imagem && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={imagem}
                        alt={e.evento.titulo ?? "Imagem do evento"}
                        loading="lazy"
                        className="bg-muted max-h-56 w-full rounded-lg border object-contain"
                      />
                    )}
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
                    {e.evento.descricao && <DescricaoEvento texto={e.evento.descricao} />}
                    {/* A44: dito antes do toque, não descoberto depois. */}
                    {e.fotoObrigatoria && (
                      <p className="flex items-center gap-1.5 text-sm">
                        <Camera className="text-muted-foreground size-4 shrink-0" />
                        Este evento pede foto para a entrada.
                      </p>
                    )}
                    {/* O aviso de "cancelada" some junto com o card de Minhas
                        inscrições; esta linha é o que explica a volta do evento. */}
                    {e.situacao === "cancelada" && (
                      <p className="text-muted-foreground text-sm">
                        Você cancelou sua inscrição neste evento. Se mudou de ideia,
                        é só se inscrever de novo.
                      </p>
                    )}
                    <AcaoVisualizacao
                      preview={preview}
                      nota="Somente o próprio associado pode se inscrever."
                    >
                      <Inscrever eventoId={e.evento.id} />
                    </AcaoVisualizacao>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* ── Minhas inscrições (eventos ainda por acontecer) ──────────── */}
      {minhas.length > 0 && (
        <section aria-label="Minhas inscrições" className="grid gap-3">
          <h2 className="text-lg font-semibold">Minhas inscrições</h2>
          <div className="grid gap-4">
            {minhas.map((e) => {
              // Cancelada não chega aqui (volta para as abertas); recusada fica.
              const recusada = e.situacao === "recusada"
              const confirmada = e.situacao === "confirmada"
              const eventoCancelado = e.evento.situacao === "cancelado"
              const adiado = e.evento.situacao === "adiado"
              // A44: "confirmada" só quando a foto exigida já foi enviada.
              const faltaFoto =
                e.fotoObrigatoria && !e.temFoto && !recusada && !eventoCancelado
              const codigo = codigos.get(e.evento.id)
              const periodo = periodoDoEvento(e.evento)
              const calendario =
                confirmada && !eventoCancelado && periodo
                  ? itemDoEvento(e.evento, periodo, enderecoNoPortal(e.evento.id))
                  : null
              const google = calendario ? linkGoogleAgenda(calendario) : null
              const podeDesistir =
                e.presencas === 0 &&
                Boolean(e.inscricaoId) &&
                !eventoCancelado &&
                PODE_DESISTIR.has(e.situacao ?? "")
              return (
                <div key={e.evento.id} id={`evento-${e.evento.id}`} className="scroll-mt-20">
                  {/* id: recibo, RSVP e lembrete da véspera apontam para #inscricao-<id>. */}
                  <Card
                    id={e.inscricaoId ? `inscricao-${e.inscricaoId}` : undefined}
                    className="scroll-mt-20"
                  >
                    <CardContent className="grid gap-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <CabecalhoEvento e={e} />
                        {e.situacao &&
                          (confirmada && faltaFoto ? (
                            <Badge variant="warning">falta enviar a foto</Badge>
                          ) : (
                            <Badge
                              variant={confirmada ? "success" : recusada ? "destructive" : "secondary"}
                            >
                              {ROTULO[e.situacao] ?? e.situacao}
                            </Badge>
                          ))}
                      </div>

                      {e.evento.descricao && <DescricaoEvento texto={e.evento.descricao} />}

                      {eventoCancelado && (
                        <Alert variant="warning">
                          <AlertDescription>
                            Este evento foi cancelado. {e.evento.motivo_situacao ?? ""}
                          </AlertDescription>
                        </Alert>
                      )}
                      {adiado && (
                        <Alert variant="warning">
                          <AlertDescription>
                            Este evento foi adiado
                            {e.evento.adiado_para ? (
                              <>
                                {" "}para{" "}
                                <time dateTime={e.evento.adiado_para}>
                                  {formatarDataHora(e.evento.adiado_para)}
                                </time>
                              </>
                            ) : (
                              " e ainda não tem nova data"
                            )}
                            . {e.evento.motivo_situacao ?? ""} Sua inscrição continua valendo.
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
                      {faltaFoto && e.inscricaoToken && (
                        <Alert variant="warning">
                          <Camera />
                          <AlertTitle>Falta enviar sua foto</AlertTitle>
                          <AlertDescription>
                            Este evento pede sua foto para a entrada — sem ela, a
                            inscrição não se completa. A foto é tirada na hora, pela
                            câmera do celular ou do computador.
                          </AlertDescription>
                          <div className="col-start-2 mt-2">
                            <AcaoVisualizacao
                              preview={preview}
                              nota="Somente o próprio associado envia a foto."
                            >
                              <Button asChild>
                                <Link href={`/inscricao/${e.inscricaoToken}`}>
                                  <Camera />
                                  Enviar foto
                                </Link>
                              </Button>
                            </AcaoVisualizacao>
                          </div>
                        </Alert>
                      )}

                      {e.situacao === "pendente" && (
                        <p className="text-muted-foreground text-sm">
                          Sua inscrição está na fila de avaliação. Avisamos por e-mail assim
                          que houver resposta.
                        </p>
                      )}
                      {e.situacao === "lista_espera" && (
                        <p className="text-muted-foreground text-sm">
                          Você está na lista de espera. Se surgir vaga, o sindicato avisa
                          por e-mail.
                        </p>
                      )}
                      {recusada && (
                        <p className="text-muted-foreground text-sm">
                          Sua inscrição neste evento não foi aprovada. Se tiver dúvidas,
                          fale com o sindicato.
                        </p>
                      )}

                      {((confirmada && !eventoCancelado) || podeDesistir) && (
                        <div className="grid gap-3 border-t pt-4">
                          {confirmada &&
                            !eventoCancelado &&
                            e.evento.exige_rsvp &&
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

                          {/* A45: o código de entrada dentro do portal, a dois
                              toques na fila da recepção. A página pública fica
                              para tela cheia e para quem chega pelo e-mail. */}
                          {codigo && e.inscricaoToken && (
                            <details className="group rounded-lg border">
                              <summary className="focus-visible:ring-ring/50 flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm font-medium outline-none focus-visible:ring-3 [&::-webkit-details-marker]:hidden">
                                <span className="flex items-center gap-2">
                                  <QrCode className="size-4" />
                                  Meu código de entrada
                                </span>
                                <ChevronDown className="text-muted-foreground size-4 transition-transform group-open:rotate-180" />
                              </summary>
                              <div className="grid justify-items-center gap-3 border-t p-4">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={codigo}
                                  alt="QR Code da sua inscrição"
                                  className="size-56 rounded-md bg-white p-2"
                                />
                                <p className="text-muted-foreground text-center text-xs">
                                  Mostre na recepção. Se preferir, a equipe também
                                  encontra você pelo nome ou CPF.
                                </p>
                                {/* A página do código tem foto e RSVP que gravam pelo
                                    token: na visualização, fica desligada. */}
                                <AcaoVisualizacao
                                  preview={preview}
                                  nota="A página do código é do próprio associado."
                                >
                                  <Button asChild variant="ghost">
                                    <a
                                      href={`/inscricao/${e.inscricaoToken}`}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      <Maximize2 />
                                      Abrir em tela cheia
                                    </a>
                                  </Button>
                                </AcaoVisualizacao>
                              </div>
                            </details>
                          )}

                          {/* A84: leitura pura — vale também na visualização. */}
                          {calendario && (
                            <div className="flex flex-wrap gap-2">
                              <Button asChild variant="outline">
                                <a href={`/portal/eventos/${e.evento.id}/calendario`}>
                                  <CalendarPlus />
                                  Adicionar ao calendário
                                </a>
                              </Button>
                              {google && (
                                <Button asChild variant="ghost">
                                  <a href={google} target="_blank" rel="noreferrer">
                                    <ExternalLink />
                                    Google Agenda
                                  </a>
                                </Button>
                              )}
                            </div>
                          )}

                          {podeDesistir && e.inscricaoId && (
                            <AcaoVisualizacao preview={preview} nota="">
                              <CancelarInscricao
                                inscricaoId={e.inscricaoId}
                                situacao={e.situacao}
                              />
                            </AcaoVisualizacao>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* ── Outros eventos por vir, sem inscrição aberta ─────────────── */}
      {fechados.length > 0 && (
        <section aria-label="Outros eventos" className="grid gap-3">
          <h2 className="text-lg font-semibold">Outros eventos</h2>
          <Card>
            <CardContent>
              <ul className="divide-y">
                {fechados.map((e) => (
                  <li
                    key={e.evento.id}
                    id={`evento-${e.evento.id}`}
                    className="flex scroll-mt-20 flex-wrap items-center justify-between gap-2 py-3"
                  >
                    <CabecalhoEvento e={e} compacto />
                    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <Clock className="size-3.5 shrink-0" />
                      <span>
                        {e.situacao === "cancelada" && "Você cancelou sua inscrição. "}
                        <MotivoFechada e={e} />
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </section>
      )}

      {/* ── Eventos anteriores: só os dele, recolhidos (A135) ────────── */}
      {anteriores.length > 0 && (
        <section aria-label="Eventos anteriores">
          <details className="group bg-card rounded-xl border">
            <summary className="focus-visible:ring-ring/50 flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 outline-none focus-visible:ring-3 [&::-webkit-details-marker]:hidden">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <History className="text-muted-foreground size-5" />
                Eventos anteriores
                <Badge variant="secondary">{todosAnteriores.length}</Badge>
              </h2>
              <ChevronDown className="text-muted-foreground size-4 transition-transform group-open:rotate-180" />
            </summary>
            <ul className="divide-y border-t px-4">
              {anteriores.map((e) => (
                <li
                  key={e.evento.id}
                  id={`evento-${e.evento.id}`}
                  className="flex scroll-mt-20 flex-wrap items-center justify-between gap-2 py-3"
                >
                  {/* O recibo antigo no sino aponta para #inscricao-<id>:
                      AbrirAncoraRecolhida abre a seção ao chegar. */}
                  <div
                    id={e.inscricaoId ? `inscricao-${e.inscricaoId}` : undefined}
                    className="min-w-0 scroll-mt-20"
                  >
                    <CabecalhoEvento e={e} compacto />
                  </div>
                  <span className="flex flex-wrap gap-1.5">
                    {e.presencas > 0 && <Badge variant="success">presença registrada</Badge>}
                    {e.evento.situacao === "cancelado" && (
                      <Badge variant="secondary">evento cancelado</Badge>
                    )}
                    {e.situacao && e.situacao !== "confirmada" && (
                      <Badge variant="secondary">{ROTULO[e.situacao] ?? e.situacao}</Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            {todosAnteriores.length > anteriores.length && (
              <p className="text-muted-foreground border-t px-4 py-3 text-xs">
                Mostrando os {LIMITE_ANTERIORES} mais recentes.
              </p>
            )}
          </details>
          <AbrirAncoraRecolhida />
        </section>
      )}

      {/* ── Agenda de atividades ─────────────────────────────────────── */}
      {/* id: /portal/agenda e o "Agenda de atividades" do Início caem aqui. */}
      <section id="agenda" aria-label="Agenda" className="grid scroll-mt-20 gap-3">
        <h2 className="text-lg font-semibold">Agenda de atividades</h2>
        <Card>
          <CardContent>
            {agenda.length === 0 ? (
              <EstadoVazio icone={CalendarDays} titulo="Nenhuma atividade programada no momento." />
            ) : (
              <ul className="divide-y">
                {agenda.map((a) => {
                  // A85: compromisso espelhado de um evento leva ao cartão dele.
                  const ev = porAgenda.get(a.id)
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
                        {a.inicio && (
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
      </section>
    </>
  )
}

/**
 * Por que a inscrição não está aberta (A150): com a data de abertura ou a
 * nova data do adiado, em vez do motivo genérico. A regra continua sendo a
 * de `inscricoesAbertas` — aqui só se diz quando.
 */
function MotivoFechada({ e }: { e: EventoDoFiliado }) {
  const ev = e.evento
  if (ev.situacao === "adiado" && ev.adiado_para) {
    return (
      <>
        Adiado para{" "}
        <time dateTime={ev.adiado_para}>{formatarDataHora(ev.adiado_para)}</time>. As
        inscrições reabrem para a nova data.
      </>
    )
  }
  if (e.inscricoesAbremEm) {
    return (
      <>
        As inscrições abrem em{" "}
        <time dateTime={e.inscricoesAbremEm}>{formatarDataHora(e.inscricoesAbremEm)}</time>.
      </>
    )
  }
  return <>{e.motivoFechada ?? "Inscrições fechadas."}</>
}

function CabecalhoEvento({ e, compacto = false }: { e: EventoDoFiliado; compacto?: boolean }) {
  // A data que vale: a nova, se adiado (A150); adiado sem data, nenhuma.
  const periodo = periodoDoEvento(e.evento)
  return (
    <div className="min-w-0">
      <h3 className={compacto ? "truncate font-medium" : "text-lg font-medium"}>
        {e.evento.titulo ?? "(sem título)"}
      </h3>
      <div className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5">
          <CalendarDays className="size-3.5 shrink-0" />
          {periodo ? (
            <time dateTime={periodo.inicio}>{textoPeriodo(periodo)}</time>
          ) : e.evento.situacao === "adiado" ? (
            "Adiado — nova data a definir"
          ) : (
            "Data a definir"
          )}
        </span>
        {e.evento.local && (
          <span className="flex items-center gap-1.5">
            <MapPin className="size-3.5 shrink-0" />
            {e.evento.local}
          </span>
        )}
      </div>
      {/* A83: o endereço abre o mapa (no celular, o aplicativo de mapas). */}
      {!compacto && e.evento.endereco && (
        <a
          href={linkMapa(e.evento.endereco)}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground mt-1 inline-flex items-center gap-1.5 text-xs underline-offset-4 hover:underline pointer-coarse:min-h-11"
        >
          {!e.evento.local && <MapPin className="size-3.5 shrink-0" />}
          <span>{e.evento.endereco}</span>
          <span className="text-foreground inline-flex items-center gap-1 font-medium">
            · Ver no mapa
            <ExternalLink className="size-3" />
          </span>
        </a>
      )}
    </div>
  )
}
