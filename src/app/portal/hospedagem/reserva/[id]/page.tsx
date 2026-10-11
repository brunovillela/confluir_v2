import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import QRCode from "qrcode"
import { ArrowLeft, Clock, IdCard } from "lucide-react"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
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
  contatosDosHoteis,
  registrosDoCpf,
  type ContatoHotel,
} from "@/lib/db/filiado-portal"
import { listarHoteis } from "@/lib/db/hospedagem"
import {
  ROTULO_SITUACAO_RESERVA,
  linkDaReserva,
  reservaDaPessoa,
} from "@/lib/db/hospedagem-garantida"
import {
  dataBR,
  dataHoraBR,
  noitesDaEstadia,
} from "@/lib/hospedagem-garantida-constantes"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { CancelarReservaBotao, ConfirmarOfertaBotao } from "../../cupom-portal"
import { ContatoDoHotel } from "../../contato-hotel"
import { CompartilharReserva } from "./compartilhar-reserva"

export const metadata: Metadata = { title: "Reserva de hospedagem — Portal do Associado" }

export default async function ReservaHospedagemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string; email?: string }>
}) {
  const { filiado, preview } = await requireVisualizacaoPortal()
  const [{ id }, { salvo, email }] = await Promise.all([params, searchParams])

  const [registros, hoteis] = await Promise.all([registrosDoCpf(filiado.cpf), listarHoteis()])
  const reserva = await reservaDaPessoa(id, registros, hoteis)
  if (!reserva) notFound()

  const hotel = hoteis.find((h) => h.id === reserva.hotelId) ?? null
  const comQr = reserva.situacao === "confirmada" || reserva.situacao === "hospedado"
  const [qr, contatos, link] = await Promise.all([
    comQr
      ? QRCode.toDataURL(reserva.token, { errorCorrectionLevel: "M", margin: 1, width: 512 })
      : Promise.resolve(null),
    hotel ? contatosDosHoteis([hotel]) : Promise.resolve(new Map<string, ContatoHotel>()),
    // O link abre o QR sem login: na visualização da gestão, nem vai à tela.
    comQr && !preview ? linkDaReserva(reserva.token) : Promise.resolve(null),
  ])
  const contato = contatos.get(reserva.hotelId) ?? null
  const noites = noitesDaEstadia(reserva.checkIn, reserva.checkOut).length
  // Só o horário cadastrado no hotel (sem cadastro, não se inventa um).
  const horarioCheckin = hotel?.horario_checkin ? hotel.horario_checkin.slice(0, 5) : null
  const nomeHotel = reserva.hotelNome ?? "Hotel parceiro"

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/portal/hospedagem">
            <ArrowLeft />
            Hospedagem
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Reserva de hospedagem</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {nomeHotel} · {dataBR(reserva.checkIn)} a {dataBR(reserva.checkOut)}
        </p>
      </div>

      {salvo === "1" && (
        <Alert variant="success">
          <AlertDescription>
            Reserva confirmada! O quarto já está definido e o hotel foi avisado.{" "}
            {email === "0" ? (
              <>
                Como o seu cadastro está sem e-mail, guarde esta página ou use
                &quot;Copiar link&quot; abaixo.{" "}
                <Link href="/portal/cadastro">Cadastre um e-mail em Meu cadastro</Link> para
                receber as próximas confirmações.
              </>
            ) : (
              "Enviamos os detalhes para o seu e-mail."
            )}
          </AlertDescription>
        </Alert>
      )}

      {reserva.situacao === "aguardando_confirmacao" && (
        <Alert variant="warning">
          <AlertTitle>Esta vaga veio da lista de espera e falta a sua confirmação</AlertTitle>
          <AlertDescription>
            <p>
              Ela fica guardada até{" "}
              <strong>
                {reserva.confirmarAte ? dataHoraBR(new Date(reserva.confirmarAte)) : "—"}
              </strong>
              . Sem confirmação, passa para a próxima pessoa da lista.
            </p>
            {reserva.esperaToken ? (
              <AcaoVisualizacao preview={preview} nota="Somente o próprio associado pode confirmar.">
                <ConfirmarOfertaBotao token={reserva.esperaToken} />
              </AcaoVisualizacao>
            ) : (
              <p>Use o botão do e-mail da lista de espera.</p>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Dados da reserva</CardTitle>
              <Badge
                variant={
                  reserva.situacao === "confirmada" || reserva.situacao === "hospedado"
                    ? "success"
                    : reserva.situacao === "nao_compareceu"
                      ? "destructive"
                      : reserva.situacao === "aguardando_confirmacao"
                        ? "warning"
                        : "outline"
                }
              >
                {ROTULO_SITUACAO_RESERVA[reserva.situacao]}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <p>
              <span className="text-muted-foreground">Hotel: </span>
              {reserva.hotelNome ?? "—"}
            </p>
            <p>
              <span className="text-muted-foreground">Check-in: </span>
              {dataBR(reserva.checkIn)}
              {horarioCheckin ? `, a partir das ${horarioCheckin}` : ""}
            </p>
            <p>
              <span className="text-muted-foreground">Check-out: </span>
              {dataBR(reserva.checkOut)} ({noites} noite{noites === 1 ? "" : "s"})
            </p>
            <p className="text-muted-foreground text-xs">
              Quarto compartilhado apenas com pessoas do mesmo sexo.
            </p>
            <ContatoDoHotel contato={contato} className="border-t pt-3" />

            {reserva.podeCancelar ? (
              <div className="grid gap-2 border-t pt-3">
                {reserva.prazoCancelamento && (
                  <p className="flex items-start gap-2 font-medium">
                    <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
                    Não vai poder ir? Cancele pelo portal até{" "}
                    {dataHoraBR(new Date(reserva.prazoCancelamento))}.
                  </p>
                )}
                <AcaoVisualizacao preview={preview} nota="Somente o próprio associado pode cancelar.">
                  <CancelarReservaBotao id={reserva.id} />
                </AcaoVisualizacao>
              </div>
            ) : (
              reserva.situacao === "confirmada" &&
              reserva.prazoCancelamento && (
                <p className="text-muted-foreground border-t pt-3 text-xs">
                  O prazo para cancelar pelo portal terminou em{" "}
                  {dataHoraBR(new Date(reserva.prazoCancelamento))}. Se não puder
                  ir, fale com o sindicato.
                </p>
              )
            )}
          </CardContent>
        </Card>

        {qr && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">QR Code da reserva</CardTitle>
              <CardDescription className="flex items-start gap-2 text-xs">
                <IdCard className="mt-0.5 size-4 shrink-0" />
                Apresente este QR Code e um documento oficial com foto na
                recepção do hotel.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid justify-items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr}
                alt="QR Code da reserva"
                className="size-64 rounded-md border bg-white p-2"
              />
              <div className="grid w-full gap-1.5">
                <p className="text-muted-foreground text-xs">
                  Guarde o link da reserva: ele abre este QR Code sem senha, mesmo sem
                  entrar no portal.
                </p>
                <AcaoVisualizacao
                  preview={preview}
                  nota="O link da reserva é só do associado."
                >
                  {link ? (
                    <CompartilharReserva
                      link={link}
                      titulo="Reserva de hospedagem"
                      texto={`Reserva no ${nomeHotel}: ${dataBR(reserva.checkIn)} a ${dataBR(reserva.checkOut)}. QR Code para a recepção:`}
                    />
                  ) : (
                    <Button type="button" variant="outline" disabled>
                      Copiar link
                    </Button>
                  )}
                </AcaoVisualizacao>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </>
  )
}
