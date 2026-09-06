import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  DoorOpen,
  ExternalLink,
  ListChecks,
  Pencil,
  TriangleAlert,
  UserPlus,
} from "lucide-react"

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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import {
  estadoDoRsvp,
  indicadoresDoEvento,
  inscricoesAbertas,
  listarInscricoes,
  obterEvento,
  SITUACOES_EVENTO,
  SITUACOES_INSCRICAO,
} from "@/lib/db/eventos"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import {
  AvaliarInscricao,
  EnviarRsvpForm,
  SituacaoEventoForm,
} from "../evento-forms"

export const metadata: Metadata = { title: "Evento — Confluir" }

const ROTULO_EVENTO = new Map(SITUACOES_EVENTO.map((s) => [s.valor, s.rotulo]))
const ROTULO_INSC = new Map(SITUACOES_INSCRICAO.map((s) => [s.valor, s.rotulo]))

function Indicador({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string
  valor: string | number
  detalhe?: string
}) {
  return (
    <Card>
      <CardContent className="grid gap-1">
        <span className="text-muted-foreground text-xs">{rotulo}</span>
        <span className="text-2xl font-semibold tabular-nums">{valor}</span>
        {detalhe && (
          <span className="text-muted-foreground text-xs">{detalhe}</span>
        )}
      </CardContent>
    </Card>
  )
}

export default async function EventoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  const sessao = await requirePermissao("eventos", ["eventos_gestao"])
  const gestor = podeAcessar(sessao.permissoes, "eventos_gestao")
  const { id } = await params
  const { salvo } = await searchParams

  const evento = await obterEvento(id)
  if (!evento) notFound()

  const [indicadores, inscricoes] = await Promise.all([
    indicadoresDoEvento(evento),
    listarInscricoes({ eventoId: id, situacao: "todas" }),
  ])
  const { capacidade } = indicadores
  const rsvp = estadoDoRsvp(evento)
  const abertura = inscricoesAbertas(evento, capacidade)

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/eventos">
            <ArrowLeft />
            Eventos
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {evento.titulo ?? "(sem título)"}
              </h1>
              <Badge
                variant={
                  evento.situacao === "publicado"
                    ? "success"
                    : evento.situacao === "cancelado"
                      ? "destructive"
                      : evento.situacao === "adiado"
                        ? "warning"
                        : "secondary"
                }
              >
                {ROTULO_EVENTO.get(evento.situacao) ?? evento.situacao}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {formatarDataHora(evento.inicio)}
              {evento.termino ? ` até ${formatarDataHora(evento.termino)}` : ""}
              {evento.local ? ` · ${evento.local}` : ""}
            </p>
          </div>
          {gestor && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`/painel/eventos/${id}/editar`}>
                  <Pencil />
                  Editar
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/painel/eventos/${id}/convidados`}>
                  <UserPlus />
                  Convidados
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`/painel/eventos/${id}/campos`}>
                  <ListChecks />
                  Campos
                </Link>
              </Button>
              {evento.situacao === "publicado" && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/recepcao?evento=${id}`}>
                    <DoorOpen />
                    Abrir recepção
                  </Link>
                </Button>
              )}
              {evento.situacao === "publicado" && (
                <Button asChild variant="outline" size="sm">
                  <a
                    href={`/evento/${evento.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink />
                    Ver página pública
                  </a>
                </Button>
              )}
            </div>
          )}
        </div>
      </div>

      {salvo && (
        <Alert variant="success">
          <AlertDescription>Evento salvo.</AlertDescription>
        </Alert>
      )}

      {capacidade.excedeLotacao && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>
            <strong>
              Os confirmados ({capacidade.confirmadas}) já passaram da lotação do
              local ({capacidade.lotacao}).
            </strong>{" "}
            A lotação máxima é limitada pelas normas de prevenção e combate a
            incêndio e pânico e não pode ser ultrapassada no dia — parte das
            pessoas pode ficar sem acomodação.
          </AlertDescription>
        </Alert>
      )}

      {!abertura.aberta && evento.situacao === "publicado" && (
        <Alert variant="warning">
          <AlertDescription>
            Inscrições fechadas: {abertura.motivo}
          </AlertDescription>
        </Alert>
      )}

      {evento.motivo_situacao &&
        (evento.situacao === "cancelado" || evento.situacao === "adiado") && (
          <Alert variant="warning">
            <AlertDescription>
              <strong>
                {evento.situacao === "cancelado" ? "Cancelado" : "Adiado"}
                {evento.situacao === "adiado" && !evento.adiado_para
                  ? " (sem nova data)"
                  : evento.adiado_para
                    ? ` para ${formatarData(evento.adiado_para)}`
                    : ""}
                :
              </strong>{" "}
              {evento.motivo_situacao}
            </AlertDescription>
          </Alert>
        )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador
          rotulo="Confirmados"
          valor={capacidade.confirmadas}
          detalhe={
            capacidade.vagas !== null
              ? `de ${capacidade.vagas} vagas${capacidade.overbookingPercentual > 0 ? ` (lotação ${capacidade.lotacao} +${capacidade.overbookingPercentual}%)` : ""}${capacidade.cotaRestante > 0 ? `, ${capacidade.vagasPublicas} no link público` : ""}`
              : "sem lotação definida"
          }
        />
        <Indicador
          rotulo="Aguardando"
          valor={capacidade.pendentes}
          detalhe={
            capacidade.listaEspera > 0
              ? `${capacidade.listaEspera} em lista de espera`
              : undefined
          }
        />
        <Indicador
          rotulo="Convidados"
          valor={indicadores.convidados}
          detalhe={
            capacidade.cotaConvidados > 0
              ? `cota de ${capacidade.cotaConvidados}, ${capacidade.cotaRestante} livre(s)`
              : "sem cota reservada"
          }
        />
        <Indicador
          rotulo="Comparecimento"
          valor={
            indicadores.comparecimentoPercentual !== null
              ? `${indicadores.comparecimentoPercentual}%`
              : "—"
          }
          detalhe="maior presença de um dia sobre os confirmados"
        />
      </div>

      {evento.exige_rsvp && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">RSVP</CardTitle>
            <CardDescription>
              Intenção de comparecer, declarada antes do evento.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-6 text-sm">
            <span>
              <strong className="tabular-nums">{indicadores.rsvpSim}</strong> vêm
            </span>
            <span>
              <strong className="tabular-nums">{indicadores.rsvpNao}</strong> não
              vêm
            </span>
            <span className="text-muted-foreground">
              <strong className="tabular-nums">
                {indicadores.rsvpSemResposta}
              </strong>{" "}
              sem resposta
            </span>
          </CardContent>
          {gestor && (
            <CardContent className="border-t pt-6">
              {rsvp.situacao === "sem_data" ? (
                <Alert variant="warning">
                  <AlertDescription>
                    Falta dizer <strong>quando a confirmação abre</strong>. Sem
                    data, a pergunta chegaria junto com a inscrição — e quem
                    confirma no minuto seguinte não está dizendo nada novo.
                    Defina em Editar.
                  </AlertDescription>
                </Alert>
              ) : rsvp.situacao === "aguardando" ? (
                <Alert variant="info">
                  <AlertDescription>
                    A confirmação abre em{" "}
                    <strong>{formatarDataHora(rsvp.abreEm)}</strong>. Até lá o
                    passo fica travado para o inscrito, que já foi avisado na
                    página dele de que receberá o e-mail nessa data.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="grid gap-3">
                  {rsvp.situacao === "aberto" && !rsvp.enviadoEm && (
                    <Alert variant="warning">
                      <TriangleAlert />
                      <AlertDescription>
                        A confirmação abriu em{" "}
                        <strong>{formatarDataHora(rsvp.abreEm)}</strong> e o
                        e-mail <strong>ainda não foi enviado</strong>. Os
                        inscritos estão esperando por ele.
                      </AlertDescription>
                    </Alert>
                  )}
                  <EnviarRsvpForm
                    eventoId={evento.id}
                    jaEnviados={indicadores.rsvpEnviados}
                    semResposta={indicadores.rsvpSemResposta}
                  />
                </div>
              )}
            </CardContent>
          )}
        </Card>
      )}

      {indicadores.presencasPorDia.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Presença por dia</CardTitle>
            <CardDescription>
              O evento tem {indicadores.presencasPorDia.length} dia(s) e a
              presença é registrada em cada um.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dia</TableHead>
                    <TableHead className="text-right">Presentes</TableHead>
                    <TableHead className="text-right">
                      Sobre os confirmados
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {indicadores.presencasPorDia.map((p) => (
                    <TableRow key={p.dia.id}>
                      <TableCell>
                        {formatarData(p.dia.data)}
                        {p.dia.rotulo ? ` — ${p.dia.rotulo}` : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {p.presentes}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {capacidade.confirmadas > 0
                          ? `${Math.round((p.presentes / capacidade.confirmadas) * 100)}%`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Inscrições</CardTitle>
          <CardDescription>
            {inscricoes.length === 0
              ? "Nenhuma inscrição ainda."
              : `${inscricoes.length} no total.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {inscricoes.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead className="text-right">Presenças</TableHead>
                    <TableHead>Inscrita em</TableHead>
                    {gestor && <TableHead>Avaliar</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inscricoes.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>
                        <span className="font-medium">
                          {i.anonimizada_em
                            ? "(participante anonimizado)"
                            : (i.nome ?? "—")}
                        </span>
                        {i.titular_id && (
                          <Badge variant="secondary" className="ml-2">
                            convidado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            i.situacao === "confirmada"
                              ? "success"
                              : i.situacao === "recusada" ||
                                  i.situacao === "cancelada"
                                ? "destructive"
                                : "secondary"
                          }
                        >
                          {ROTULO_INSC.get(i.situacao) ?? i.situacao}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {i.origem}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {i.presencas || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatarData(i.created_at)}
                      </TableCell>
                      {gestor && (
                        <TableCell>
                          {i.anonimizada_em ? (
                            <span className="text-muted-foreground text-xs">
                              —
                            </span>
                          ) : (
                            <AvaliarInscricao
                              inscricaoId={i.id}
                              situacao={
                                ROTULO_INSC.get(i.situacao) ?? i.situacao
                              }
                            />
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {gestor && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Situação do evento</CardTitle>
            <CardDescription>
              Publicar coloca o link público no ar. Adiar e cancelar avisam quem
              se inscreveu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SituacaoEventoForm eventoId={evento.id} situacao={evento.situacao} />
          </CardContent>
        </Card>
      )}
    </>
  )
}
