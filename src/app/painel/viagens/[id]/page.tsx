import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ItensViagemDetalhe, SituacaoViagemBadge } from "@/components/viagens"
import { requirePermissao } from "@/lib/auth"
import { buscarViagem } from "@/lib/db/viagens"
import { formatarCnpjCpf, formatarData, formatarDataHora } from "@/lib/formato"
import { ROTULO_BENEFICIARIO } from "@/lib/viagens-constantes"

export const metadata: Metadata = { title: "Viagem — Confluir" }

/** Uma viagem na gestão. O atendimento por item entra na fase 2. */
export default async function ViagemGestaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("viagens_gestao")
  const [{ id }, { salvo }] = await Promise.all([params, searchParams])
  const viagem = await buscarViagem(id)
  if (!viagem) notFound()

  const convidado = viagem.beneficiarioTipo === "convidado"

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/painel/viagens">
            <ArrowLeft />
            Passagens e hospedagens
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
          {viagem.solicitanteNome ? ` por ${viagem.solicitanteNome}` : ""}
        </p>
      </div>

      {salvo === "1" && (
        <Alert variant="success">
          <AlertDescription>Viagem lançada.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quem viaja</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Campo
              rotulo="Nome"
              valor={`${viagem.beneficiarioNome} · ${ROTULO_BENEFICIARIO[viagem.beneficiarioTipo]}`}
            />
            {convidado && (
              <>
                <Campo
                  rotulo="CPF"
                  valor={viagem.convidadoCpf ? formatarCnpjCpf(viagem.convidadoCpf) : null}
                />
                <Campo
                  rotulo="Nascimento"
                  valor={
                    viagem.convidadoNascimento ? formatarData(viagem.convidadoNascimento) : null
                  }
                />
                <Campo rotulo="E-mail" valor={viagem.convidadoEmail} />
                <Campo rotulo="Telefone" valor={viagem.convidadoTelefone} />
              </>
            )}
            <Campo rotulo="Motivo" valor={viagem.motivo} />
            <Campo rotulo="Departamento que banca" valor={viagem.departamentoNome} />
            <Campo rotulo="Evento" valor={viagem.eventoTitulo} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Passagens e hospedagens</CardTitle>
        </CardHeader>
        <CardContent>
          <ItensViagemDetalhe itens={viagem.itens} />
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
