import type { Metadata } from "next"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { requireSessaoHotel } from "@/lib/auth"
import { contasDoHotel } from "@/lib/db/hospedagem"

import { HotelShell } from "../hotel-shell"
import { ContasHotel } from "./contas-form"

export const metadata: Metadata = { title: "Dados bancários — Confluir" }

export default async function ContasHotelPage() {
  const { hotel } = await requireSessaoHotel()
  const { disponivel, contas } = await contasDoHotel(hotel.id)

  return (
    <HotelShell nomeHotel={hotel.nome ?? "Hotel parceiro"}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dados bancários</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Contas de recebimento dos faturamentos — Pix ou depósito bancário
          (TED). No faturamento você escolhe a conta.
        </p>
      </div>

      {!disponivel ? (
        <Alert>
          <AlertDescription>
            O cadastro de contas ainda não está habilitado — o sindicato precisa
            rodar a atualização do banco (supabase/hospedagem-faturamento.sql).
          </AlertDescription>
        </Alert>
      ) : (
        <ContasHotel
          contas={contas.map((c) => ({
            id: c.id,
            tipo: c.tipo,
            titular: c.titular,
            documento: c.documento,
            banco: c.banco,
            agencia: c.agencia,
            conta: c.conta,
            chave_pix: c.chave_pix,
            ativo: c.ativo,
          }))}
        />
      )}
    </HotelShell>
  )
}
