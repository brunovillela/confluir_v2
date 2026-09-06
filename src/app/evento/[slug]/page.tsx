import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CalendarDays, MapPin, Users } from "lucide-react"

import { Marca } from "@/components/marca"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { urlArquivoEventos } from "@/lib/db/eventos"
import { carregarEventoPublico } from "@/lib/db/eventos-publico"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { formatarDataHora } from "@/lib/formato"
import { tenantAtual } from "@/lib/tenant"

import { ContagemRegressiva } from "./contagem"
import { InscricaoForm } from "./inscricao-form"

export const metadata: Metadata = {
  title: "Evento — Confluir",
  robots: { index: false },
}

export default async function EventoPublicoPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const tenantId = await tenantAtual()

  const [publico, org] = await Promise.all([
    carregarEventoPublico(slug, tenantId),
    obterOrganizacao(),
  ])
  // Rascunho não tem página pública — quem tem o link ainda não vê nada.
  if (!publico || publico.evento.situacao === "rascunho") notFound()

  const { evento } = publico
  const cardUrl = await urlArquivoEventos(evento.card_url)
  const entidade = org?.nomeFantasia ?? org?.nomeRazao ?? null

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Marca variante="completa" />
        {entidade && (
          <p className="text-muted-foreground mt-3 text-xs uppercase tracking-wide">
            {entidade}
          </p>
        )}
      </div>

      {cardUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={cardUrl}
          alt={evento.titulo ?? "Card do evento"}
          className="mb-6 w-full rounded-lg border object-cover"
        />
      )}

      <div className="mb-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          {evento.titulo ?? "Evento"}
        </h1>
        <div className="text-muted-foreground mt-3 grid gap-1 text-sm">
          <p className="flex items-center justify-center gap-2">
            <CalendarDays className="size-4" />
            {formatarDataHora(evento.inicio)}
            {evento.termino ? ` até ${formatarDataHora(evento.termino)}` : ""}
          </p>
          {evento.local && (
            <p className="flex items-center justify-center gap-2">
              <MapPin className="size-4" />
              {evento.local}
              {evento.endereco ? ` — ${evento.endereco}` : ""}
            </p>
          )}
        </div>
      </div>

      {evento.inicio && evento.situacao === "publicado" && (
        <div className="mb-8">
          <ContagemRegressiva inicioIso={evento.inicio} />
        </div>
      )}

      {evento.situacao === "cancelado" && (
        <Alert variant="destructive" className="mb-6">
          <AlertDescription>
            <strong>Este evento foi cancelado.</strong>
            {evento.motivo_situacao ? ` ${evento.motivo_situacao}` : ""}
          </AlertDescription>
        </Alert>
      )}

      {evento.situacao === "adiado" && (
        <Alert variant="warning" className="mb-6">
          <AlertDescription>
            <strong>
              Este evento foi adiado
              {evento.adiado_para
                ? ` para ${formatarDataHora(evento.adiado_para)}`
                : " e ainda não tem nova data"}
              .
            </strong>
            {evento.motivo_situacao ? ` ${evento.motivo_situacao}` : ""}
          </AlertDescription>
        </Alert>
      )}

      {evento.descricao && (
        <Card className="mb-6">
          <CardContent>
            <p className="text-sm whitespace-pre-wrap">{evento.descricao}</p>
          </CardContent>
        </Card>
      )}

      {publico.aberta ? (
        <Card>
          <CardContent className="grid gap-5">
            <div>
              <h2 className="text-lg font-medium">Inscrição</h2>
              {publico.vagasRestantes !== null && (
                <p className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                  <Users className="size-3.5" />
                  {publico.vagasRestantes === 0
                    ? "Sem vagas no momento"
                    : `${publico.vagasRestantes} vaga(s) disponível(is)`}
                </p>
              )}
            </div>
            <InscricaoForm
              slug={slug}
              campos={publico.campos}
              termoInscricao={publico.termoInscricao?.texto ?? null}
              termoFoto={publico.termoFoto?.texto ?? null}
              fotoObrigatoria={publico.fotoObrigatoria}
              modoFoto={publico.modoFoto}
              retencaoFotoDias={publico.retencaoFotoDias}
            />
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <AlertDescription>
            {publico.motivoFechada ?? "As inscrições estão fechadas."}
          </AlertDescription>
        </Alert>
      )}

      <p className="text-muted-foreground mt-8 text-center text-xs">
        Seus dados são tratados conforme a Lei Geral de Proteção de Dados. Você
        pode ver, corrigir ou excluir o que informou a qualquer momento em{" "}
        <Link href="/meus-dados" className="underline">
          Meus dados
        </Link>
        .
      </p>
    </main>
  )
}
