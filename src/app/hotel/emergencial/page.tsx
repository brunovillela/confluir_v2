import type { Metadata } from "next"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { hojeSP } from "@/lib/db/comum"
import { ehGarantida } from "@/lib/db/hospedagem-garantida"
import { formatarData } from "@/lib/formato"
import { requireAreaHotel } from "@/lib/hotel-acesso"

import { HotelShell } from "../hotel-shell"
import { CupomEmergencialForm } from "./emergencial-form"

export const metadata: Metadata = { title: "Cupom emergencial — Confluir" }

/**
 * Cupom emergencial: o hóspede chegou sem cupom e não consegue pedir pelo
 * portal. O hotel faz a reserva direta — só HOJE e só neste hotel — com as
 * mesmas regras do cupom. No "Ver como o hotel" da gestão, só leitura.
 */
export default async function CupomEmergencialPage() {
  const { hotel, preview, gestorNome, podeEditar, somenteConsulta } = await requireAreaHotel("emergencial")
  const hoje = hojeSP()
  const garantida = ehGarantida(hotel)

  return (
    <HotelShell
      somenteConsulta={somenteConsulta}
      nomeHotel={hotel.nome ?? "Hotel parceiro"}
      garantida={garantida}
      preview={preview ? { gestorNome } : undefined}
    >
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cupom emergencial</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Para o hóspede que chegou sem cupom e não conseguiu pedir pelo portal — check-in hoje,{" "}
          {formatarData(hoje)}, neste hotel.
        </p>
      </div>

      {preview && (
        <Alert>
          <AlertDescription>
            Visualização da gestão: a busca e o registro ficam desligados — só o pessoal do hotel faz
            o cupom emergencial.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Buscar o filiado pelo CPF</CardTitle>
          <CardDescription>
            Valem as mesmas regras do cupom: filiação ativa, convênio vigente e as condições do
            sindicato{garantida ? ", além do histórico de não comparecimento" : ""}. Só para hoje e só
            para este hotel.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CupomEmergencialForm hoje={hoje} preview={preview || !podeEditar} />
        </CardContent>
      </Card>
    </HotelShell>
  )
}
