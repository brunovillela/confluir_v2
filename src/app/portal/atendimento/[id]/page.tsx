import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Plus } from "lucide-react"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"
import { ConversaAtendimento, SituacaoAtendimentoBadge } from "@/components/atendimento/conversa"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EXPLICACAO_SITUACAO_ATENDIMENTO, prazoLegivel, reabrirAte } from "@/lib/atendimento-constantes"
import { hojeSP } from "@/lib/db/comum"
import { atendimentoDoFiliado } from "@/lib/db/portal-atendimentos"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { EncerrarSolicitacaoForm, ReabrirSolicitacaoForm, ResponderForm } from "../formularios"

export const metadata: Metadata = { title: "Solicitação — Portal do Associado" }

export default async function PortalAtendimentoDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ aberta?: string; encerrada?: string; reaberta?: string }>
}) {
  const { filiado, preview } = await requireVisualizacaoPortal()
  const { id } = await params
  const { aberta, encerrada, reaberta } = await searchParams
  const dados = await atendimentoDoFiliado(id, filiado.cpf)
  if (!dados) notFound()
  const { atendimento: a, mensagens } = dados
  const prazo = prazoLegivel(a, hojeSP())
  const concluida = a.situacao === "concluida"
  // Concluída há pouco: o associado ainda pode reabrir (A97).
  const ate = reabrirAte(a)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/portal/atendimento">
            <ArrowLeft />
            Atendimento
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{a.titulo}</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              {a.assuntoRotulo} · aberta em {formatarDataHora(a.criadoEm)}
              {prazo ? ` · ${prazo}` : ""}
            </p>
          </div>
          <SituacaoAtendimentoBadge situacao={a.situacao} atrasada={a.atrasada} />
        </div>
      </div>

      {aberta === "1" && (
        <Alert variant="success">
          <AlertDescription>
            Solicitação enviada. A entidade responde por aqui{a.prazo ? ` até ${formatarData(a.prazo)}` : ""}, e você recebe um aviso.
          </AlertDescription>
        </Alert>
      )}
      {encerrada === "1" && concluida && (
        <Alert variant="success">
          <AlertDescription>Solicitação encerrada. A entidade foi avisada.</AlertDescription>
        </Alert>
      )}
      {reaberta === "1" && !concluida && (
        <Alert variant="success">
          <AlertDescription>Solicitação reaberta. A entidade foi avisada — conte abaixo o que ainda falta.</AlertDescription>
        </Alert>
      )}

      <p className="text-muted-foreground text-sm">
        {concluida && !ate ? "Encerrada. Se o assunto voltou, abra uma nova solicitação." : EXPLICACAO_SITUACAO_ATENDIMENTO[a.situacao]}
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversa</CardTitle>
        </CardHeader>
        <CardContent>
          <ConversaAtendimento mensagens={mensagens} ladoDeCa="filiado" anexoBase="/portal/atendimento/anexo" />
        </CardContent>
      </Card>

      {!concluida ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Responder</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-6">
            <AcaoVisualizacao preview={preview}>
              <ResponderForm atendimentoId={a.id} />
            </AcaoVisualizacao>
            <div className="border-t pt-4">
              <AcaoVisualizacao preview={preview}>
                <EncerrarSolicitacaoForm atendimentoId={a.id} />
              </AcaoVisualizacao>
            </div>
          </CardContent>
        </Card>
      ) : ate ? (
        <Card>
          <CardContent>
            <AcaoVisualizacao preview={preview}>
              <ReabrirSolicitacaoForm atendimentoId={a.id} ate={ate} />
            </AcaoVisualizacao>
          </CardContent>
        </Card>
      ) : (
        <div>
          <Button variant="outline" asChild className="min-h-11 w-full sm:w-auto">
            <Link href={`/portal/atendimento?nova=1&assunto=${encodeURIComponent(a.assunto)}`}>
              <Plus />
              Abrir uma nova solicitação
            </Link>
          </Button>
        </div>
      )}
    </>
  )
}
