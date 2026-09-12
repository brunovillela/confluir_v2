import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import QRCode from "qrcode"
import { ArrowLeft, IdCard } from "lucide-react"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"
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
import { registrosDoCpf } from "@/lib/db/filiado-portal"
import { listarHoteis } from "@/lib/db/hospedagem"
import {
  ROTULO_SITUACAO_RESERVA,
  reservaDaPessoa,
} from "@/lib/db/hospedagem-garantida"
import {
  dataBR,
  dataHoraBR,
  noitesDaEstadia,
} from "@/lib/hospedagem-garantida-constantes"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { PortalShell } from "../../../portal-shell"
import { CancelarReservaBotao } from "../../cupom-portal"

export const metadata: Metadata = { title: "Reserva de hospedagem — Portal do Associado" }

export default async function ReservaHospedagemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  const { filiado, preview, gestorNome } = await requireVisualizacaoPortal()
  const [{ id }, { salvo }] = await Promise.all([params, searchParams])

  const [registros, hoteis] = await Promise.all([registrosDoCpf(filiado.cpf), listarHoteis()])
  const reserva = await reservaDaPessoa(id, registros, hoteis)
  if (!reserva) notFound()

  const comQr = reserva.situacao === "confirmada" || reserva.situacao === "hospedado"
  const qr = comQr
    ? await QRCode.toDataURL(reserva.token, { errorCorrectionLevel: "M", margin: 1, width: 512 })
    : null
  const noites = noitesDaEstadia(reserva.checkIn, reserva.checkOut).length

  return (
    <PortalShell preview={preview ? { filiadoNome: filiado.nome_completo, gestorNome } : undefined}>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/portal/hospedagem">
            <ArrowLeft />
            Hospedagem
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Reserva de hospedagem</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {reserva.hotelNome ?? "Hotel parceiro"} · {dataBR(reserva.checkIn)} a{" "}
          {dataBR(reserva.checkOut)}
        </p>
      </div>

      {salvo === "1" && (
        <Alert variant="success">
          <AlertDescription>
            Reserva confirmada! O quarto já está definido e o hotel foi avisado.
            Enviamos os detalhes para o seu e-mail.
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
            </p>
            <p>
              <span className="text-muted-foreground">Check-out: </span>
              {dataBR(reserva.checkOut)} ({noites} noite{noites === 1 ? "" : "s"})
            </p>
            <p className="text-muted-foreground text-xs">
              Quarto compartilhado apenas com pessoas do mesmo sexo.
            </p>

            {reserva.situacao === "aguardando_confirmacao" && (
              <Alert variant="warning">
                <AlertDescription>
                  Esta vaga veio da lista de espera e ainda precisa da sua
                  confirmação. Confirme em{" "}
                  <Link href="/portal/hospedagem" className="underline">
                    Hospedagem → Lista de espera
                  </Link>{" "}
                  ou pelo botão do e-mail.
                </AlertDescription>
              </Alert>
            )}

            {reserva.podeCancelar ? (
              <div className="grid gap-1 border-t pt-3">
                <AcaoVisualizacao preview={preview} nota="Somente o próprio associado pode cancelar.">
                  <CancelarReservaBotao id={reserva.id} />
                </AcaoVisualizacao>
                {reserva.prazoCancelamento && (
                  <p className="text-muted-foreground text-xs">
                    Você pode cancelar pelo portal até{" "}
                    {dataHoraBR(new Date(reserva.prazoCancelamento))}.
                  </p>
                )}
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
            <CardContent className="flex justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr}
                alt="QR Code da reserva"
                className="size-64 rounded-md border bg-white p-2"
              />
            </CardContent>
          </Card>
        )}
      </div>
    </PortalShell>
  )
}
