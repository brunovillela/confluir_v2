import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { requireSessaoHotel } from "@/lib/auth"
import {
  contasDoHotel,
  descreverConta,
  servicosFaturaveis,
  vencimentoMinimoFatura,
} from "@/lib/db/hospedagem"

import { HotelShell } from "../../hotel-shell"
import { FaturaForm } from "./fatura-form"

export const metadata: Metadata = { title: "Nova fatura — Confluir" }

export default async function NovaFaturaPage() {
  const { hotel } = await requireSessaoHotel()

  const [servicos, contasRes] = await Promise.all([
    servicosFaturaveis(hotel),
    contasDoHotel(hotel.id),
  ])

  return (
    <HotelShell nomeHotel={hotel.nome ?? "Hotel parceiro"}>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/hotel/faturamento">
            <ArrowLeft />
            Faturamento
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Nova fatura</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Selecione os serviços, suba a DANFE no valor total do subsídio e
          escolha como receber. Ao emitir, o sistema gera a ordem de pagamento
          para o sindicato (situação “Em autorização”).
        </p>
      </div>

      {hotel.exige_relatorio_para_faturar === true && (
        <Alert>
          <AlertDescription>
            Este hotel exige o relatório/extrato da reserva assinado pelos
            hóspedes para faturar — serviços sem o documento não aparecem na
            lista.
          </AlertDescription>
        </Alert>
      )}

      <FaturaForm
        vencimentoMinimo={vencimentoMinimoFatura()}
        servicos={servicos.map((s) => ({
          id: s.id,
          codigo: s.codigo,
          checkin_date: s.checkin_date,
          checkout_date: s.checkout_date,
          comparecidos: s.comparecidos,
          custo_entidade: s.custo_entidade,
          temRelatorio: !!s.relatorio,
        }))}
        contas={contasRes.contas
          .filter((c) => c.ativo)
          .map((c) => ({ id: c.id, tipo: c.tipo, rotulo: descreverConta(c) }))}
      />
    </HotelShell>
  )
}
