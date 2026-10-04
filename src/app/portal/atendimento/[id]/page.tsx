import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"
import { ConversaAtendimento, SituacaoAtendimentoBadge } from "@/components/atendimento/conversa"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { EXPLICACAO_SITUACAO_ATENDIMENTO } from "@/lib/atendimento-constantes"
import { atendimentoDoFiliado } from "@/lib/db/portal-atendimentos"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { PortalShell } from "../../portal-shell"
import { ResponderForm } from "../formularios"

export const metadata: Metadata = { title: "Solicitação — Portal do Associado" }

export default async function PortalAtendimentoDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ aberta?: string }>
}) {
  const { filiado, preview, gestorNome } = await requireVisualizacaoPortal()
  const { id } = await params
  const { aberta } = await searchParams
  const dados = await atendimentoDoFiliado(id, filiado.cpf)
  if (!dados) notFound()
  const { atendimento: a, mensagens } = dados

  return (
    <PortalShell preview={preview ? { filiadoNome: filiado.nome_completo, gestorNome } : undefined}>
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
            <p className="text-muted-foreground mt-1 text-xs">
              {a.assuntoRotulo} · aberta em {formatarDataHora(a.criadoEm)}
              {a.prazo && a.situacao !== "concluida" ? ` · resposta até ${formatarData(a.prazo)}` : ""}
            </p>
          </div>
          <SituacaoAtendimentoBadge situacao={a.situacao} />
        </div>
      </div>

      {aberta === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Solicitação enviada. A entidade responde por aqui{a.prazo ? ` até ${formatarData(a.prazo)}` : ""}, e você recebe um aviso.
          </AlertDescription>
        </Alert>
      )}

      <p className="text-muted-foreground text-sm">{EXPLICACAO_SITUACAO_ATENDIMENTO[a.situacao]}</p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversa</CardTitle>
        </CardHeader>
        <CardContent>
          <ConversaAtendimento mensagens={mensagens} ladoDeCa="filiado" anexoBase="/portal/atendimento/anexo" />
        </CardContent>
      </Card>

      {a.situacao !== "concluida" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Responder</CardTitle>
          </CardHeader>
          <CardContent>
            <AcaoVisualizacao preview={preview}>
              <ResponderForm atendimentoId={a.id} />
            </AcaoVisualizacao>
          </CardContent>
        </Card>
      )}
    </PortalShell>
  )
}
