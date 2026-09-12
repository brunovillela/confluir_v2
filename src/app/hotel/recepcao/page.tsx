import type { Metadata } from "next"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { requireSessaoHotel } from "@/lib/auth"
import { ehGarantida } from "@/lib/db/hospedagem-garantida"

import { HotelShell } from "../hotel-shell"
import { PortaHotel } from "./porta-hotel"

export const metadata: Metadata = { title: "Recepção — Área do hotel" }

export default async function HotelRecepcaoPage() {
  const { hotel } = await requireSessaoHotel()

  return (
    <HotelShell nomeHotel={hotel.nome ?? "Hotel parceiro"}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Recepção</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Leia o QR Code da reserva ou busque o hóspede pelo nome ou CPF. A
          entrada só é registrada depois de conferido um documento oficial com
          foto.
        </p>
      </div>

      {ehGarantida(hotel) ? (
        <PortaHotel />
      ) : (
        <Alert>
          <AlertDescription>
            A recepção por QR Code é do convênio de demanda garantida. Neste
            hotel, o convênio é de pagamento por uso: registre o comparecimento
            na própria reserva.
          </AlertDescription>
        </Alert>
      )}
    </HotelShell>
  )
}
