import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileText } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { AquisicaoBadge, SituacaoProcessoBadge } from "@/components/compras"
import { SituacaoBadge } from "@/app/painel/financeiro/situacao-badge"
import { requirePermissao } from "@/lib/auth"
import {
  buscarProcesso,
  listarFornecedores,
  urlArquivoCompras,
  type OrdemDoProcesso,
} from "@/lib/db/compras"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import {
  BotaoAcaoProcesso,
  GerarOrdemForm,
  PropostaNovaForm,
  RecebimentoForm,
  RegistrarCompraForm,
} from "./processo-forms"

export const metadata: Metadata = {
  title: "Processo de aquisição — Confluir",
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
    <div className={colSpan ? "sm:col-span-2 lg:col-span-3" : undefined}>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  )
}

function LinhaOrdem({ ordem }: { ordem: OrdemDoProcesso }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Link
          href={`/painel/financeiro/ordens/${ordem.id}`}
          className="text-primary font-medium whitespace-nowrap tabular-nums hover:underline"
        >
          {ordem.codigo ?? "(sem código)"}
        </Link>
        <span className="text-muted-foreground truncate">
          {ordem.descricao ?? "—"}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="whitespace-nowrap tabular-nums">
          {formatarMoeda(ordem.valor_pago ?? ordem.valor_inicial_cobranca)}
        </span>
        {ordem.vencimento && (
          <span className="text-muted-foreground whitespace-nowrap">
            vence {formatarData(ordem.vencimento)}
          </span>
        )}
        {ordem.forma_pagamento && (
          <span className="text-muted-foreground">{ordem.forma_pagamento}</span>
        )}
        <SituacaoBadge situacao={ordem.situacao} />
        {ordem.autorizado && (
          <span className="text-success-fg text-xs whitespace-nowrap">
            Aprovada{ordem.autorizadorNome ? ` por ${ordem.autorizadorNome}` : ""}
            {ordem.autorizacao_data
              ? ` em ${formatarData(ordem.autorizacao_data)}`
              : ""}
          </span>
        )}
      </div>
    </div>
  )
}

export default async function ProcessoCompraPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ criado?: string; salvo?: string }>
}) {
  const sessao = await requirePermissao("aquisicoes_compras", [
    "aquisicoes_compras_edicao",
    "aquisicoes_avaliacoes",
    "aquisicoes_recebimentos",
  ])
  const { id } = await params
  const { criado, salvo } = await searchParams

  const processo = await buscarProcesso(id)
  if (!processo) notFound()

  const podeOperar = podeAcessar(sessao.permissoes, "aquisicoes_compras_edicao")
  const podeReceber = podeAcessar(sessao.permissoes, "aquisicoes_recebimentos", [
    "aquisicoes_compras_edicao",
  ])
  // Legado do Bubble em produção até a virada: nada de operar por aqui.
  const operavel = podeOperar && !processo.legado && !processo.cancelado

  const fornecedores =
    operavel && !processo.comprado ? await listarFornecedores() : []

  const propostasComUrl = await Promise.all(
    processo.propostas.map(async (p) => ({
      ...p,
      arquivoUrl: await urlArquivoCompras(p.proposta_arquivo_url),
    }))
  )
  const fornecimentosComUrl = await Promise.all(
    (processo.fornecimentos ?? []).map(async (f) => ({
      ...f,
      notaUrl: await urlArquivoCompras(f.nota_fiscal_url),
    }))
  )

  const escolhidas = processo.propostas.filter((p) => p.escolhida)
  const totalEscolhidas = escolhidas.reduce(
    (s, p) => s + (p.valor_proposta ?? 0),
    0
  )

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras">
            <ArrowLeft />
            Compras
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight tabular-nums">
              Processo {processo.codigo ?? "(sem código)"}
            </h1>
            <SituacaoProcessoBadge situacao={processo.situacao} />
            <AquisicaoBadge direta={processo.aquisicao_direta} />
            {processo.legado && <Badge variant="outline">Migrado do Bubble</Badge>}
          </div>
          {operavel && !processo.comprado && (
            <BotaoAcaoProcesso
              acao="cancelar"
              campos={{ processo_id: processo.id }}
              confirmacao="Cancelar este processo de aquisição?"
              variant="destructive"
            >
              Cancelar processo
            </BotaoAcaoProcesso>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Registrado em {formatarDataHora(processo.created_at)}
        </p>
      </div>

      {criado === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Processo registrado.</AlertDescription>
        </Alert>
      )}
      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Alteração salva.</AlertDescription>
        </Alert>
      )}
      {processo.legado && (
        <Alert>
          <AlertDescription>
            Processo migrado do Bubble — os campos descritivos não vieram na
            migração e o processo é somente leitura aqui até a virada de chave.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Solicitação</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Campo rotulo="Produto ou serviço" colSpan>
              <span className="whitespace-pre-wrap">
                {processo.produto ?? (
                  <span className="text-muted-foreground">
                    (migração parcial — sem descrição)
                  </span>
                )}
              </span>
            </Campo>
            <Campo rotulo="Tipo">
              {processo.e_produto === null
                ? "—"
                : processo.e_produto
                  ? "Bem / produto"
                  : "Prestação de serviço"}
            </Campo>
            <Campo rotulo="Departamento solicitante">
              {processo.departamentoNome ?? "—"}
            </Campo>
            <Campo rotulo="Centro de custo">
              {processo.centroCustoNome ?? "—"}
            </Campo>
            <Campo rotulo="Vinculado a projeto">
              {processo.projetoNome ?? "Não há"}
            </Campo>
            <Campo rotulo="Limite para receber">
              {formatarData(processo.data_limite)}
            </Campo>
            <Campo rotulo="Local de entrega preferencial">
              {processo.local_entrega ?? "Não informado"}
            </Campo>
            {processo.observacao && (
              <Campo rotulo="Observações" colSpan>
                <span className="whitespace-pre-wrap">{processo.observacao}</span>
              </Campo>
            )}
          </dl>
        </CardContent>
      </Card>

      {(processo.aquisicao_direta !== true ||
        processo.propostas.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Cotação</CardTitle>
                <CardDescription>
                  {processo.em_cotacao
                    ? `Aberta${processo.cotacaoResponsavelNome ? ` — responsável ${processo.cotacaoResponsavelNome}` : ""}${processo.cotacao_inicio ? `, desde ${formatarData(processo.cotacao_inicio)}` : ""}`
                    : processo.cotacao_termino
                      ? `Encerrada em ${formatarData(processo.cotacao_termino)}${processo.cotacaoResponsavelNome ? ` — responsável ${processo.cotacaoResponsavelNome}` : ""}`
                      : "Ainda não iniciada"}
                </CardDescription>
              </div>
              {operavel && !processo.comprado && (
                <div className="flex gap-2">
                  {!processo.em_cotacao && !processo.cotacao_termino && (
                    <BotaoAcaoProcesso
                      acao="iniciarCotacao"
                      campos={{ processo_id: processo.id }}
                      variant="default"
                    >
                      Iniciar cotação
                    </BotaoAcaoProcesso>
                  )}
                  {processo.em_cotacao && (
                    <BotaoAcaoProcesso
                      acao="encerrarCotacao"
                      campos={{ processo_id: processo.id }}
                      confirmacao="Encerrar a cotação com as propostas escolhidas?"
                      variant="default"
                    >
                      Encerrar cotação
                    </BotaoAcaoProcesso>
                  )}
                  {!processo.em_cotacao && processo.cotacao_termino && (
                    <BotaoAcaoProcesso
                      acao="reabrirCotacao"
                      campos={{ processo_id: processo.id }}
                      confirmacao="Reabrir a cotação deste processo?"
                    >
                      Reabrir
                    </BotaoAcaoProcesso>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            {propostasComUrl.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhuma proposta registrada.
              </p>
            ) : (
              <ul className="grid gap-2">
                {propostasComUrl.map((p) => (
                  <li
                    key={p.id}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm ${p.escolhida ? "border-success/40 bg-success/10" : "border-border"}`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium">
                        {p.fornecedorNome ?? "(fornecedor não informado)"}
                        {p.fornecedorBloqueado && (
                          <Badge variant="warning" className="ml-2">
                            Fornecedor bloqueado
                          </Badge>
                        )}
                      </p>
                      <p className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 text-xs">
                        <span className="tabular-nums">
                          {formatarMoeda(p.valor_proposta)}
                        </span>
                        {p.forma_pagamento && <span>{p.forma_pagamento}</span>}
                        <span>
                          {p.previsao_entrega
                            ? `entrega prevista ${formatarData(p.previsao_entrega)}`
                            : "previsão de entrega não informada"}
                        </span>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {p.arquivoUrl && (
                        <Button variant="ghost" size="sm" asChild>
                          <a
                            href={p.arquivoUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <FileText />
                            PDF
                          </a>
                        </Button>
                      )}
                      {p.escolhida ? (
                        <>
                          <Badge variant="success">Escolhida</Badge>
                          {operavel && !processo.comprado && (
                            <BotaoAcaoProcesso
                              acao="escolherProposta"
                              campos={{
                                processo_id: processo.id,
                                proposta_id: p.id,
                                escolher: "0",
                              }}
                              variant="ghost"
                            >
                              Desfazer
                            </BotaoAcaoProcesso>
                          )}
                        </>
                      ) : (
                        operavel &&
                        !processo.comprado && (
                          <>
                            <BotaoAcaoProcesso
                              acao="escolherProposta"
                              campos={{
                                processo_id: processo.id,
                                proposta_id: p.id,
                                escolher: "1",
                              }}
                            >
                              Escolher
                            </BotaoAcaoProcesso>
                            <BotaoAcaoProcesso
                              acao="removerProposta"
                              campos={{
                                processo_id: processo.id,
                                proposta_id: p.id,
                              }}
                              confirmacao="Remover esta proposta?"
                              variant="ghost"
                            >
                              Remover
                            </BotaoAcaoProcesso>
                          </>
                        )
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {operavel && processo.em_cotacao && (
              <>
                <Separator />
                <PropostaNovaForm
                  processoId={processo.id}
                  fornecedores={fornecedores}
                />
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Compra</CardTitle>
          {processo.comprado ? (
            <CardDescription>
              Comprado
              {processo.compradoPorNome ? ` por ${processo.compradoPorNome}` : ""}
              {processo.compra_data
                ? ` em ${formatarData(processo.compra_data)}`
                : ""}{" "}
              · total {formatarMoeda(processo.compra_valor)}
            </CardDescription>
          ) : (
            <CardDescription>
              {escolhidas.length > 0
                ? `${escolhidas.length} proposta(s) escolhida(s) · total ${formatarMoeda(totalEscolhidas)}`
                : "Aguardando cotação e escolha de propostas"}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent className="grid gap-4">
          {!processo.comprado &&
            operavel &&
            escolhidas.length > 0 &&
            !processo.em_cotacao && (
              <RegistrarCompraForm
                processoId={processo.id}
                resumo={`Serão criados ${escolhidas.length} fornecimento(s), total ${formatarMoeda(totalEscolhidas)}.`}
              />
            )}

          {fornecimentosComUrl.length === 0 &&
            processo.fornecimentos !== null &&
            processo.comprado && (
              <p className="text-muted-foreground text-sm">
                {processo.legado
                  ? "Processo legado — desdobramentos de fornecimento não migrados."
                  : "Nenhum fornecimento registrado."}
              </p>
            )}
          {processo.fornecimentos === null && (
            <Alert variant="warning">
              <AlertDescription>
                Rode <code>supabase/compras.sql</code> para habilitar os
                desdobramentos de fornecimento.
              </AlertDescription>
            </Alert>
          )}

          {fornecimentosComUrl.map((f, i) => (
            <div key={f.id} className="border-border rounded-md border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  Fornecimento {i + 1} — {f.fornecedorNome ?? "(sem fornecedor)"}
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium tabular-nums">
                    {formatarMoeda(f.valor)}
                  </span>
                  {f.recebido ? (
                    <Badge variant="success">Recebido</Badge>
                  ) : (
                    <Badge variant="info">A receber</Badge>
                  )}
                </div>
              </div>
              <p className="text-muted-foreground mt-1 flex flex-wrap gap-x-3 text-xs">
                {f.forma_pagamento && <span>{f.forma_pagamento}</span>}
                {f.data_compra && (
                  <span>comprado em {formatarData(f.data_compra)}</span>
                )}
                {f.compradorNome && <span>comprador {f.compradorNome}</span>}
                {f.previsao_entrega && (
                  <span>entrega prevista {formatarData(f.previsao_entrega)}</span>
                )}
                {f.notaUrl && (
                  <a
                    href={f.notaUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:underline"
                  >
                    Nota fiscal
                  </a>
                )}
              </p>

              <div className="mt-3 grid gap-3">
                {f.ordem ? (
                  <LinhaOrdem ordem={f.ordem} />
                ) : operavel ? (
                  <GerarOrdemForm
                    processoId={processo.id}
                    fornecimentoId={f.id}
                  />
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Ordem de pagamento ainda não gerada.
                  </p>
                )}

                {f.recebido ? (
                  <p className="text-muted-foreground text-sm">
                    Recebido
                    {f.recebidoPorNome ? ` por ${f.recebidoPorNome}` : ""}
                    {f.recebimento_data
                      ? ` em ${formatarData(f.recebimento_data)}`
                      : ""}
                    {f.recebimento_de_acordo === true &&
                      ", fornecimento considerado adequado à solicitação"}
                    {f.recebimento_de_acordo === false &&
                      ", com ressalvas no fornecimento"}
                    {f.recebimento_observacao && (
                      <> · Observação: {f.recebimento_observacao}</>
                    )}
                  </p>
                ) : (
                  podeReceber &&
                  !processo.legado && (
                    <>
                      <Separator />
                      <RecebimentoForm
                        processoId={processo.id}
                        fornecimentoId={f.id}
                      />
                    </>
                  )
                )}
              </div>
            </div>
          ))}

          {processo.ordensAvulsas.length > 0 && (
            <div className="grid gap-2">
              <p className="text-muted-foreground text-xs font-medium uppercase">
                Cobranças do processo
              </p>
              {processo.ordensAvulsas.map((o) => (
                <LinhaOrdem key={o.id} ordem={o} />
              ))}
            </div>
          )}

          {processo.legado && processo.recebido && (
            <p className="text-muted-foreground text-sm">
              Recebimento (legado): {formatarData(processo.recebimento_data)}
            </p>
          )}
        </CardContent>
      </Card>
    </>
  )
}
