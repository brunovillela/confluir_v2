import type { Metadata } from "next"
import QRCode from "qrcode"

import { AuthShell } from "@/components/auth/auth-shell"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ROTULO_SITUACAO_RESERVA, reservaPorToken } from "@/lib/db/hospedagem-garantida"
import { dataBR, noitesDaEstadia } from "@/lib/hospedagem-garantida-constantes"

export const metadata: Metadata = { title: "Reserva de hospedagem — Confluir" }

/**
 * Link direto da reserva (e-mail de confirmação e "Copiar link" da equipe):
 * abre sem login e mostra o QR Code que o hotel lê na recepção. Quem tem o
 * link já tem o token que o QR carrega — a página não expõe nada além dele,
 * só o primeiro nome e as datas.
 */
export default async function ReservaPublicaPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const r = await reservaPorToken(token)
  const comQr = r && (r.situacao === "confirmada" || r.situacao === "hospedado")
  const qr = comQr
    ? await QRCode.toDataURL(r.token, { errorCorrectionLevel: "M", margin: 1, width: 512 })
    : null

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>Reserva de hospedagem</CardTitle>
          {r && (
            <CardDescription>
              {r.hotelNome ?? "Hotel parceiro"} · {dataBR(r.checkIn)} a {dataBR(r.checkOut)} ·{" "}
              {noitesDaEstadia(r.checkIn, r.checkOut).length} noite(s)
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          {!r ? (
            <p>Link inválido. Peça ao sindicato o link atualizado da reserva.</p>
          ) : (
            <>
              <p>
                {r.primeiroNome ? `${r.primeiroNome}, sua` : "Sua"} reserva está{" "}
                <strong>{ROTULO_SITUACAO_RESERVA[r.situacao].toLowerCase()}</strong>
                {r.quarto ? ` — quarto ${r.quarto}` : ""}.
              </p>
              {qr ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={qr}
                    alt="QR Code da reserva"
                    className="mx-auto size-64 rounded-md border bg-white p-2"
                  />
                  <p className="text-muted-foreground text-xs">
                    Na chegada, apresente este QR Code na recepção do hotel com um documento
                    oficial com foto. Guarde este link — ele abre sem senha.
                  </p>
                </>
              ) : r.situacao === "aguardando_confirmacao" ? (
                <p className="text-muted-foreground">
                  A vaga está guardada aguardando a sua confirmação — use o link do e-mail da
                  lista de espera ou o portal do associado.
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Esta reserva não está mais ativa. Em caso de dúvida, fale com o sindicato.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  )
}
