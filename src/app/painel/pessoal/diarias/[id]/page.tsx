import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SituacaoDiariaBadge } from "@/components/diarias"
import { requirePermissao } from "@/lib/auth"
import {
  buscarSolicitacaoDiaria,
  descontosDaDiaria,
} from "@/lib/db/diarias"
import { cobrancasDiariaPendentes } from "@/lib/db/veiculos"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"

import { AvaliacaoDiariaForm } from "./avaliacao-form"

export const metadata: Metadata = {
  title: "Solicitação de diária — Confluir",
}

function Campo({
  rotulo,
  children,
  colSpan,
}: {
  rotulo: string
  children: React.ReactNode
  colSpan?: boolean
}) {
  return (
    <div className={colSpan ? "sm:col-span-2" : undefined}>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  )
}

export default async function SolicitacaoDiariaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_diarias"])

  const { id } = await params
  const { salvo } = await searchParams
  const solicitacao = await buscarSolicitacaoDiaria(id)
  if (!solicitacao) notFound()

  const aguardando = solicitacao.situacao === "aguardando"
  // Aguardando: infrações do infrator para descontar. Avaliada: o que já foi
  // descontado (trilha).
  const [infracoesPendentes, descontos] = await Promise.all([
    aguardando && solicitacao.funcionario_id
      ? cobrancasDiariaPendentes(solicitacao.funcionario_id)
      : Promise.resolve([]),
    aguardando ? Promise.resolve([]) : descontosDaDiaria(id),
  ])
  const totalDescontado = descontos.reduce((s, d) => s + d.valor, 0)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/diarias">
            <ArrowLeft />
            Diárias
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Solicitação de diária
          </h1>
          <SituacaoDiariaBadge situacao={solicitacao.situacao} />
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {solicitacao.funcionarioNome ?? "(sem nome)"} · solicitada em{" "}
          {formatarDataHora(solicitacao.created_at)}
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Avaliação registrada — o funcionário foi notificado.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da solicitação</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Funcionário">
              {solicitacao.funcionario_id ? (
                <Link
                  href={`/painel/pessoal/${solicitacao.funcionario_id}`}
                  className="hover:underline"
                >
                  {solicitacao.funcionarioNome ?? "(sem nome)"}
                </Link>
              ) : (
                "—"
              )}
            </Campo>
            <Campo rotulo="Tipo de diária">{solicitacao.tipoNome ?? "—"}</Campo>
            <Campo rotulo="Quantidade">
              {solicitacao.quantidade ?? "—"} ×{" "}
              {formatarMoeda(solicitacao.valor_unitario)}
            </Campo>
            <Campo rotulo="Valor total">
              <span className="font-medium">
                {formatarMoeda(solicitacao.valor_total)}
              </span>
            </Campo>
            <Campo rotulo="Período">
              {solicitacao.data_inicio ? (
                <>
                  {formatarData(solicitacao.data_inicio)}
                  {solicitacao.data_termino &&
                    solicitacao.data_termino !== solicitacao.data_inicio && (
                      <> – {formatarData(solicitacao.data_termino)}</>
                    )}
                </>
              ) : (
                "—"
              )}
            </Campo>
            <Campo rotulo="Motivo" colSpan>
              <span className="whitespace-pre-wrap">
                {solicitacao.motivo ?? "—"}
              </span>
            </Campo>
          </dl>
        </CardContent>
      </Card>

      {aguardando ? (
        <AvaliacaoDiariaForm
          solicitacaoId={solicitacao.id}
          valorTexto={formatarMoeda(solicitacao.valor_total)}
          infracoesPendentes={infracoesPendentes}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Avaliação</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Avaliador">
                {solicitacao.avaliadorNome ?? "—"}
              </Campo>
              <Campo rotulo="Avaliada em">
                {formatarDataHora(solicitacao.avaliacao_data)}
              </Campo>
              {solicitacao.avaliacao_observacao && (
                <Campo rotulo="Observação" colSpan>
                  <span className="whitespace-pre-wrap">
                    {solicitacao.avaliacao_observacao}
                  </span>
                </Campo>
              )}
              {solicitacao.ordem_pagamento_id && (
                <Campo rotulo="Ordem de pagamento" colSpan>
                  <Link
                    href={`/painel/financeiro/ordens/${solicitacao.ordem_pagamento_id}`}
                    className="text-primary hover:underline"
                  >
                    {solicitacao.ordemCodigo ?? "(sem código)"}
                  </Link>
                  {solicitacao.ordemSituacao && (
                    <span className="text-muted-foreground">
                      {" "}
                      · {solicitacao.ordemSituacao}
                    </span>
                  )}
                </Campo>
              )}
            </dl>

            {totalDescontado > 0 && (
              <div className="mt-4 border-t pt-4">
                <p className="text-sm font-medium">
                  Infrações descontadas nesta diária (
                  {formatarMoeda(totalDescontado)})
                </p>
                <ul className="mt-2 grid gap-1 text-sm">
                  {descontos.map((d) => (
                    <li
                      key={d.infracao_id}
                      className="flex flex-wrap items-center justify-between gap-2"
                    >
                      <Link
                        href={`/painel/veiculos/infracoes/${d.infracao_id}`}
                        className="text-primary min-w-0 hover:underline"
                      >
                        <span className="tabular-nums">
                          {d.infracaoCodigo ?? "(sem código)"}
                        </span>
                        {d.descricao ? (
                          <span className="text-muted-foreground">
                            {" "}
                            — {d.descricao}
                          </span>
                        ) : null}
                      </Link>
                      <span className="tabular-nums">
                        {formatarMoeda(d.valor)}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-muted-foreground mt-2 text-xs">
                  O valor da ordem de pagamento já é o líquido (valor da diária
                  menos as infrações descontadas).
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
