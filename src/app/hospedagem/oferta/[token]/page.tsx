import type { Metadata } from "next"

import { AuthShell } from "@/components/auth/auth-shell"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { ofertaPorToken } from "@/lib/db/hospedagem-garantida"
import { dataBR, dataHoraBR } from "@/lib/hospedagem-garantida-constantes"

import { ConfirmarOfertaPublica } from "./confirmar"

export const metadata: Metadata = { title: "Vaga na hospedagem — Confluir" }

/** Página pública do botão do e-mail da lista de espera. */
export default async function OfertaHospedagemPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const oferta = await ofertaPorToken(token)

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>Vaga na hospedagem</CardTitle>
          {oferta && (
            <CardDescription>
              {oferta.hotelNome ?? "Hotel parceiro"} · check-in em{" "}
              {dataBR(oferta.checkIn)} e check-out em {dataBR(oferta.checkOut)}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid gap-4 text-sm">
          {!oferta ? (
            <p>Link inválido ou expirado.</p>
          ) : oferta.valida ? (
            <>
              <p>
                Abriu vaga para as datas que você pediu na lista de espera. Ela
                fica guardada até{" "}
                <strong>{oferta.expiraEm ? dataHoraBR(new Date(oferta.expiraEm)) : "—"}</strong>.
                Sem confirmação, passa para a próxima pessoa.
              </p>
              <ConfirmarOfertaPublica token={token} />
              <p className="text-muted-foreground text-xs">
                Na chegada ao hotel, apresente o QR Code da reserva, que fica no
                portal do associado, e um documento oficial com foto.
              </p>
            </>
          ) : oferta.situacao === "confirmada" ? (
            <p>Esta reserva já foi confirmada. O QR Code está no portal do associado, em Hospedagem.</p>
          ) : (
            <p>
              Esta oferta não está mais disponível: o prazo para confirmar
              terminou ou o pedido foi cancelado.
            </p>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  )
}
