import Link from "next/link"
import { ArrowLeft, Paperclip } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { SituacaoDiariaBadge } from "@/components/diarias"
import type { DescontoDiaria, SolicitacaoDiaria } from "@/lib/db/diarias"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"

import { AvaliacaoDiariaForm, type InfracaoPendente } from "@/app/painel/pessoal/diarias/[id]/avaliacao-form"

/**
 * Detalhe de uma solicitação de diária — a MESMA tela para as duas portas:
 * Pessoal (funcionários) e Diretoria. Muda só o "voltar" e o link da pessoa.
 */
export function DetalheDiaria({
  solicitacao,
  voltar,
  pessoaHref,
  despesasUrls,
  infracoesPendentes,
  descontos,
  salvo,
}: {
  solicitacao: SolicitacaoDiaria
  voltar: { href: string; rotulo: string }
  pessoaHref: string | null
  despesasUrls: Map<string, string | null>
  infracoesPendentes: InfracaoPendente[]
  descontos: DescontoDiaria[]
  salvo?: boolean
}) {
  const totalDescontado = descontos.reduce((s, d) => s + d.valor, 0)
  const aguardando = solicitacao.situacao === "aguardando"
  const totalGeral = (solicitacao.valor_total ?? 0) + solicitacao.valorDespesas

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={voltar.href}>
            <ArrowLeft />
            {voltar.rotulo}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Solicitação de diária</h1>
          <SituacaoDiariaBadge situacao={solicitacao.situacao} />
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {solicitacao.funcionarioNome ?? "(sem nome)"} · solicitada em{" "}
          {formatarDataHora(solicitacao.created_at)}
          {solicitacao.solicitanteNome && <> · lançada por {solicitacao.solicitanteNome}</>}
        </p>
      </div>

      {salvo && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Avaliação registrada — {solicitacao.beneficiarioTipo === "diretor" ? "o diretor" : "o funcionário"} foi
            notificado.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da solicitação</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo={solicitacao.beneficiarioTipo === "diretor" ? "Diretor(a)" : "Funcionário"}>
              {pessoaHref ? (
                <Link href={pessoaHref} className="hover:underline">
                  {solicitacao.funcionarioNome ?? "(sem nome)"}
                </Link>
              ) : (
                (solicitacao.funcionarioNome ?? "—")
              )}
            </Campo>
            <Campo rotulo="Departamento">{solicitacao.departamentoNome ?? "—"}</Campo>
            <Campo rotulo="Tipo de diária">{solicitacao.tipoNome ?? "—"}</Campo>
            <Campo rotulo="Quantidade">
              {solicitacao.quantidade ?? "—"} × {formatarMoeda(solicitacao.valor_unitario)}
            </Campo>
            <Campo rotulo="Valor da diária">
              <span className="font-medium">{formatarMoeda(solicitacao.valor_total)}</span>
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
              <span className="whitespace-pre-wrap">{solicitacao.motivo ?? "—"}</span>
            </Campo>
          </dl>

          {solicitacao.despesas.length > 0 && (
            <div className="mt-4 border-t pt-4">
              <p className="text-sm font-medium">
                Despesas extras ({formatarMoeda(solicitacao.valorDespesas)})
              </p>
              <ul className="mt-2 grid gap-1 text-sm">
                {solicitacao.despesas.map((d) => {
                  const url = despesasUrls.get(d.id)
                  return (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0">
                        {d.tipoNome ?? "Despesa"}
                        {d.descricao && (
                          <span className="text-muted-foreground"> — {d.descricao}</span>
                        )}
                        {url && (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary ml-2 inline-flex items-center gap-1 hover:underline"
                          >
                            <Paperclip className="size-3" />
                            comprovante
                          </a>
                        )}
                      </span>
                      <span className="tabular-nums">{formatarMoeda(d.valor)}</span>
                    </li>
                  )
                })}
              </ul>
              <p className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2 text-sm font-medium">
                <span>Total da solicitação</span>
                <span className="tabular-nums">{formatarMoeda(totalGeral)}</span>
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                Cada despesa vai para a conta contábil dela — a ordem de pagamento sai com o rateio.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {aguardando ? (
        <AvaliacaoDiariaForm
          solicitacaoId={solicitacao.id}
          valorTexto={formatarMoeda(totalGeral)}
          infracoesPendentes={infracoesPendentes}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Avaliação</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Avaliador">{solicitacao.avaliadorNome ?? "—"}</Campo>
              <Campo rotulo="Avaliada em">{formatarDataHora(solicitacao.avaliacao_data)}</Campo>
              {solicitacao.avaliacao_observacao && (
                <Campo rotulo="Observação" colSpan>
                  <span className="whitespace-pre-wrap">{solicitacao.avaliacao_observacao}</span>
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
                    <span className="text-muted-foreground"> · {solicitacao.ordemSituacao}</span>
                  )}
                </Campo>
              )}
            </dl>

            {totalDescontado > 0 && (
              <div className="mt-4 border-t pt-4">
                <p className="text-sm font-medium">
                  Infrações descontadas nesta diária ({formatarMoeda(totalDescontado)})
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
                        <span className="tabular-nums">{d.infracaoCodigo ?? "(sem código)"}</span>
                        {d.descricao ? (
                          <span className="text-muted-foreground"> — {d.descricao}</span>
                        ) : null}
                      </Link>
                      <span className="tabular-nums">{formatarMoeda(d.valor)}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-muted-foreground mt-2 text-xs">
                  O valor da ordem de pagamento já é o líquido (diária e despesas menos as
                  infrações descontadas).
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
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
