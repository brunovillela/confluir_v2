import Link from "next/link"
import { ExternalLink, UserRound } from "lucide-react"

import { ConversaAtendimento, SituacaoAtendimentoBadge } from "@/components/atendimento/conversa"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { Atendimento, MensagemAtendimento } from "@/lib/db/portal-atendimentos"
import { formatarCpf } from "@/lib/cpf"
import { formatarData, formatarDataHora } from "@/lib/formato"

import { RespostaAtendimentoForm } from "./resposta-form"

/**
 * O bloco de atendimento do painel — a conversa e o formulário de resposta.
 * Vive na página da solicitação e, igual, na página da Demanda que ela gerou.
 */
export function AtendimentoPainel({
  atendimento: a,
  mensagens,
  mostrarCabecalho = true,
}: {
  atendimento: Atendimento
  mensagens: MensagemAtendimento[]
  mostrarCabecalho?: boolean
}) {
  return (
    <>
      {mostrarCabecalho && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{a.titulo}</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {a.assuntoRotulo} · aberta em {formatarDataHora(a.criadoEm)}
              {a.prazo ? ` · prazo ${formatarData(a.prazo)}` : ""}
              {a.primeiraRespostaEm ? ` · primeira resposta em ${formatarDataHora(a.primeiraRespostaEm)}` : ""}
            </p>
          </div>
          <SituacaoAtendimentoBadge situacao={a.situacao} atrasada={a.atrasada} />
        </div>
      )}

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span className="flex items-center gap-2">
            <UserRound className="text-muted-foreground size-4" />
            <span>
              <strong>{a.nome ?? "Filiado"}</strong>
              <span className="text-muted-foreground"> · CPF {formatarCpf(a.cpf)}{a.email ? ` · ${a.email}` : ""}</span>
            </span>
          </span>
          <span className="flex flex-wrap gap-3 text-xs">
            {a.filiacaoId && (
              <Link href={`/painel/filiados/${a.filiacaoId}`} className="inline-flex items-center gap-1 underline underline-offset-4">
                <ExternalLink className="size-3.5" />
                Ficha do filiado
              </Link>
            )}
            {a.demandaId && (
              <Link href={`/painel/ferramentas/demandas/${a.demandaId}`} className="inline-flex items-center gap-1 underline underline-offset-4">
                <ExternalLink className="size-3.5" />
                Demanda
              </Link>
            )}
          </span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversa com o filiado</CardTitle>
          <CardDescription className="text-xs">O que a entidade escreve aqui aparece no portal e dispara um aviso ao filiado.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <ConversaAtendimento mensagens={mensagens} ladoDeCa="entidade" anexoBase="/painel/filiados/atendimentos/anexo" />
          <RespostaAtendimentoForm atendimentoId={a.id} concluida={a.situacao === "concluida"} />
        </CardContent>
      </Card>
    </>
  )
}
