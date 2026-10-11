import type { Metadata } from "next"

import { AuthShell } from "@/components/auth/auth-shell"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { avaliacaoPorToken } from "@/lib/db/hospedagem-avaliacoes"
import { ROTULO_NOTA } from "@/lib/hospedagem-avaliacoes-constantes"
import { dataBR } from "@/lib/hospedagem-garantida-constantes"

import { AvaliarForm, VoltarAHospedagem } from "./avaliar-form"

export const metadata: Metadata = { title: "Avalie sua hospedagem — Confluir" }

/**
 * Link do e-mail de avaliação (e do cartão do portal): abre sem senha — o
 * token é da avaliação, não o do QR da reserva. `?nota=N` vem da estrela
 * clicada no e-mail e já chega marcada.
 */
export default async function AvaliarHospedagemPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ nota?: string }>
}) {
  const [{ token }, { nota }] = await Promise.all([params, searchParams])
  const a = await avaliacaoPorToken(token)
  const notaInicial = /^[1-5]$/.test(nota ?? "") ? Number(nota) : null

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle>Como foi sua hospedagem?</CardTitle>
          {a && (
            <CardDescription>
              {a.hotelNome ?? "Hotel parceiro"} ·{" "}
              {a.checkIn ? `${dataBR(a.checkIn)} a ${dataBR(a.checkOut)}` : `check-out em ${dataBR(a.checkOut)}`}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          {!a ? (
            <div className="grid justify-items-start gap-3">
              <p className="text-sm">
                Link inválido. Abra a avaliação pelo portal do associado, em Hospedagem.
              </p>
              <VoltarAHospedagem />
            </div>
          ) : a.situacao === "respondida" ? (
            <div className="grid justify-items-start gap-3">
              <p className="text-sm">
                Esta hospedagem já foi avaliada
                {a.nota
                  ? ` com ${a.nota} estrela${a.nota === 1 ? "" : "s"} (${ROTULO_NOTA[a.nota].toLowerCase()})`
                  : ""}
                . Obrigado!
              </p>
              <VoltarAHospedagem />
            </div>
          ) : (
            <AvaliarForm token={a.token} notaInicial={notaInicial} />
          )}
        </CardContent>
      </Card>
    </AuthShell>
  )
}
