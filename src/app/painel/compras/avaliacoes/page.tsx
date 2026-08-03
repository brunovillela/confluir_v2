import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ClipboardCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import {
  alcadaDoUsuario,
  listarOrdensParaAvaliacao,
  type OrdemParaAvaliacao,
} from "@/lib/db/compras"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { AvaliacaoOrdemForm } from "./avaliacao-ordem-form"

export const metadata: Metadata = {
  title: "Avaliações de compras — Confluir",
}

function DadosOrdem({ ordem }: { ordem: OrdemParaAvaliacao }) {
  return (
    <div className="min-w-0">
      <p className="text-sm font-medium">
        {ordem.processo_compra_id ? (
          <Link
            href={`/painel/compras/${ordem.processo_compra_id}`}
            className="text-primary tabular-nums hover:underline"
          >
            {ordem.codigo ?? "(sem código)"}
          </Link>
        ) : (
          <span className="tabular-nums">{ordem.codigo ?? "(sem código)"}</span>
        )}
        {ordem.favorecidoNome && <> — {ordem.favorecidoNome}</>}
      </p>
      <p className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 text-xs">
        <span className="truncate">
          {ordem.produto ?? ordem.descricao ?? "—"}
        </span>
        {ordem.departamentoNome && <span>{ordem.departamentoNome}</span>}
        {ordem.vencimento && <span>vence {formatarData(ordem.vencimento)}</span>}
        {ordem.forma_pagamento && <span>{ordem.forma_pagamento}</span>}
      </p>
    </div>
  )
}

export default async function AvaliacoesComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>
}) {
  const sessao = await requirePermissao("aquisicoes_avaliacoes")
  const { salvo } = await searchParams
  const alcada = alcadaDoUsuario(sessao.permissoes)
  const { dentroDaAlcada, acimaDaAlcada } =
    await listarOrdensParaAvaliacao(alcada)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras">
            <ArrowLeft />
            Compras
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Avaliações de compras
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Ordens de pagamento de compras em autorização ·{" "}
          {alcada > 0
            ? `sua alçada: até ${formatarMoeda(alcada)}`
            : "você não tem alçada de aprovação definida"}
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Avaliação registrada.</AlertDescription>
        </Alert>
      )}
      {alcada === 0 && (
        <Alert variant="warning">
          <AlertDescription>
            Sua alçada de aprovação (campo <code>alcada_aprovacao</code> em
            permissões) está zerada — peça à gestão para definir um limite.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Na sua alçada</CardTitle>
          <CardDescription>
            Aprovar move a ordem para &quot;A pagar&quot;; devolver marca
            &quot;Aguardando informações&quot; com o motivo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {dentroDaAlcada.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              <ClipboardCheck className="mx-auto mb-2 size-5" />
              Nenhuma ordem aguardando a sua aprovação.
            </p>
          ) : (
            dentroDaAlcada.map((o) => (
              <div
                key={o.id}
                className="border-border flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <DadosOrdem ordem={o} />
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-semibold whitespace-nowrap tabular-nums">
                    {formatarMoeda(o.valor_inicial_cobranca)}
                  </span>
                  <AvaliacaoOrdemForm
                    ordemId={o.id}
                    valorTexto={formatarMoeda(o.valor_inicial_cobranca)}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {acimaDaAlcada.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Acima da sua alçada ({acimaDaAlcada.length})
            </CardTitle>
            <CardDescription>
              Visíveis como contexto — precisam de um avaliador com alçada
              maior.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {acimaDaAlcada.map((o) => (
              <div
                key={o.id}
                className="border-border flex flex-wrap items-center justify-between gap-3 rounded-md border p-3 opacity-75"
              >
                <DadosOrdem ordem={o} />
                <span className="text-sm font-semibold whitespace-nowrap tabular-nums">
                  {formatarMoeda(o.valor_inicial_cobranca)}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  )
}
