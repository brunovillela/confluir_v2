import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requireSessaoHotel } from "@/lib/auth"
import { cuponsAguardando, listarTarifas } from "@/lib/db/hospedagem"

import { ServicoForm } from "@/app/painel/hospedagem/servicos/servico-form"

import { HotelShell } from "../../hotel-shell"
import { criarReservaHotel } from "../actions"

export const metadata: Metadata = { title: "Registrar reserva — Confluir" }

export default async function NovaReservaHotelPage() {
  const { hotel } = await requireSessaoHotel()

  const [cupons, tarifas] = await Promise.all([
    cuponsAguardando(hotel.id),
    listarTarifas(hotel.id),
  ])

  return (
    <HotelShell nomeHotel={hotel.nome ?? "Hotel parceiro"}>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/hotel/inicio">
            <ArrowLeft />
            Início
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Registrar reserva</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Efetiva a hospedagem com os cupons aguardando reserva. Quarto coletivo
          só com hóspedes do mesmo sexo que aceitaram quarto coletivo; a tarifa é
          a acordada para a quantidade efetiva de pessoas no quarto.
        </p>
      </div>
      <ServicoForm
        hoteis={[]}
        hotelFixo={hotel.id}
        action={criarReservaHotel}
        cuponsAguardando={cupons.map((c) => ({
          id: c.id,
          hotel_id: c.hotel_id,
          filiadoNome: c.filiadoNome,
          check_in: c.check_in,
          sexo: c.sexo,
          aceita_quarto_coletivo: c.aceita_quarto_coletivo,
        }))}
        tarifas={tarifas.map((t) => ({
          hotel_id: t.hotel_id,
          pessoas_por_quarto: t.pessoas_por_quarto,
          custo_por_filiado: t.custo_por_filiado,
          custo_entidade: t.custo_entidade,
        }))}
      />
    </HotelShell>
  )
}
