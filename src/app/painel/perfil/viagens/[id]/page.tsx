import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ItensViagemDetalhe, SituacaoViagemBadge } from "@/components/viagens"
import { requireSessaoPainel } from "@/lib/auth"
import { buscarViagem } from "@/lib/db/viagens"
import { urlVoucher } from "@/lib/db/viagens-atendimento"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { ROTULO_BENEFICIARIO } from "@/lib/viagens-constantes"

import { CancelarViagemBotao } from "../cancelar-viagem"

export const metadata: Metadata = { title: "Viagem — Confluir" }

/** Uma viagem vista por quem viaja ou por quem a pediu. */
export default async function MinhaViagemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  const sessao = await requireSessaoPainel()
  const usuarioId = sessao.usuario.id as string
  const [{ id }, { salvo }] = await Promise.all([params, searchParams])
  const viagem = await buscarViagem(id)
  if (
    !viagem ||
    (viagem.beneficiarioUsuarioId !== usuarioId && viagem.solicitanteId !== usuarioId)
  ) {
    notFound()
  }

  const paraSi = viagem.beneficiarioUsuarioId === usuarioId
  const vouchers = new Map(
    await Promise.all(
      viagem.itens.map(async (i) => [i.id, await urlVoucher(i.voucher)] as const)
    )
  )

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/painel/perfil/viagens">
            <ArrowLeft />
            Minhas viagens
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Viagem nº {viagem.numero ?? "—"}
          </h1>
          <SituacaoViagemBadge situacao={viagem.situacao} />
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Pedida em {formatarDataHora(viagem.createdAt)}
          {viagem.solicitanteNome && !paraSi ? ` por ${viagem.solicitanteNome}` : ""}
        </p>
      </div>

      {salvo === "1" && (
        <Alert variant="success">
          <AlertDescription>
            Solicitação enviada. A equipe de viagens vai cotar com as agências, e você recebe um
            e-mail quando estiver tudo reservado.
          </AlertDescription>
        </Alert>
      )}

      {viagem.motivoSituacao && (viagem.situacao === "recusada" || viagem.situacao === "cancelada") && (
        <Alert>
          <AlertDescription>{viagem.motivoSituacao}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Dados da viagem</CardTitle>
            {viagem.situacao === "solicitada" && <CancelarViagemBotao id={viagem.id} />}
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Campo
              rotulo="Quem viaja"
              valor={`${paraSi ? "Você" : viagem.beneficiarioNome} · ${ROTULO_BENEFICIARIO[viagem.beneficiarioTipo]}`}
            />
            <Campo rotulo="Motivo" valor={viagem.motivo} />
            <Campo rotulo="Departamento que banca" valor={viagem.departamentoNome} />
            <Campo rotulo="Evento" valor={viagem.eventoTitulo} />
            {viagem.atendidoEm && (
              <Campo rotulo="Atendida em" valor={formatarData(viagem.atendidoEm)} />
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Passagens e hospedagens</CardTitle>
        </CardHeader>
        <CardContent>
          <ItensViagemDetalhe itens={viagem.itens} vouchers={vouchers} />
        </CardContent>
      </Card>
    </>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd>{valor ?? "—"}</dd>
    </div>
  )
}
