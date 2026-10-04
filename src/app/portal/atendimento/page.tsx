import type { Metadata } from "next"
import Link from "next/link"
import { Info, MessagesSquare } from "lucide-react"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"
import { SituacaoAtendimentoBadge } from "@/components/atendimento/conversa"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ASSUNTOS_ATENDIMENTO } from "@/lib/atendimento-constantes"
import { meusAtendimentos } from "@/lib/db/portal-atendimentos"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { PortalShell } from "../portal-shell"
import { NovaSolicitacaoForm } from "./formularios"

export const metadata: Metadata = { title: "Atendimento — Portal do Associado" }

/** O filiado abre solicitações e acompanha cada uma (onda 4, F2). */
export default async function PortalAtendimentoPage() {
  const { filiado, preview, gestorNome } = await requireVisualizacaoPortal()
  const { lista, disponivel } = await meusAtendimentos(filiado.cpf)

  return (
    <PortalShell preview={preview ? { filiadoNome: filiado.nome_completo, gestorNome } : undefined}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Atendimento</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Fale com a entidade por aqui: jurídico, saúde, cadastro, reembolso, reclamação ou outro assunto. Cada pedido tem prazo de resposta.
        </p>
      </div>

      {!disponivel ? (
        <Alert>
          <Info />
          <AlertDescription>O atendimento pelo portal ainda não está disponível nesta entidade.</AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nova solicitação</CardTitle>
              <CardDescription className="text-xs">
                Prazos de resposta:{" "}
                {ASSUNTOS_ATENDIMENTO.map((a) => `${a.rotulo.toLowerCase()} ${a.slaDias} dias`).join(" · ")}.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AcaoVisualizacao preview={preview}>
                <NovaSolicitacaoForm />
              </AcaoVisualizacao>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Minhas solicitações</CardTitle>
            </CardHeader>
            <CardContent>
              {lista.length === 0 ? (
                <p className="text-muted-foreground flex items-center gap-2 py-6 text-sm">
                  <MessagesSquare className="size-4" />
                  Você ainda não abriu nenhuma solicitação.
                </p>
              ) : (
                <ul className="divide-y">
                  {lista.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/portal/atendimento/${a.id}`}
                        className="hover:bg-muted/40 -mx-2 flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-md px-2 py-3 transition-colors"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-medium">{a.titulo}</span>
                          <span className="text-muted-foreground block text-xs">
                            {a.assuntoRotulo} · aberta em {formatarDataHora(a.criadoEm)}
                            {a.prazo && a.situacao !== "concluida" ? ` · resposta até ${formatarData(a.prazo)}` : ""}
                          </span>
                        </span>
                        <SituacaoAtendimentoBadge situacao={a.situacao} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PortalShell>
  )
}
