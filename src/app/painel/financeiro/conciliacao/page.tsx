import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Info, Landmark } from "lucide-react"

import { TileIndicador } from "@/components/graficos/tile"
import { moeda } from "@/components/graficos/base"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarExtratos, listarLancamentos, opcoesParaComprovacao, resumoConciliacao } from "@/lib/db/conciliacao"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { AcoesLancamento, DesfazerBotao, ExcluirExtratoBotao } from "./acoes-lancamento"
import { ImportarExtratoForm } from "./importar-form"

export const metadata: Metadata = { title: "Conciliação bancária — Confluir" }

const ABAS = [
  { valor: "pendente", rotulo: "Pendentes" },
  { valor: "conciliado", rotulo: "Conciliados" },
  { valor: "ignorado", rotulo: "Ignorados" },
] as const

/** Financeiro fecha o mês com o extrato, não com a memória (onda 5, A1). */
export default async function ConciliacaoPage({ searchParams }: { searchParams: Promise<{ situacao?: string; extrato?: string }> }) {
  const sessao = await requirePermissao("financeiro_pagamento", ["financeiro_leitura"])
  const podeEscrever = podeAcessar(sessao.permissoes, "financeiro_pagamento")
  const sp = await searchParams
  const situacao = ABAS.find((a) => a.valor === sp.situacao)?.valor ?? "pendente"
  const resumo = await resumoConciliacao()
  const [lancamentos, extratos, opcoes] = resumo.disponivel
    ? await Promise.all([listarLancamentos({ situacao, extratoId: sp.extrato }), listarExtratos(), situacao === "pendente" ? opcoesParaComprovacao() : Promise.resolve({ remessas: [], fontes: [] })])
    : [[], [], { remessas: [], fontes: [] }]

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/financeiro">
            <ArrowLeft />
            Financeiro
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Landmark className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Conciliação bancária</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Importe o extrato e case cada lançamento com a ordem paga ou com o depósito da fonte pagadora. O que casa sozinho fica conciliado; o resto você decide aqui.
        </p>
      </div>

      {!resumo.disponivel ? (
        <Alert>
          <Info />
          <AlertDescription>Falta rodar o SQL supabase/banco-conciliacao.sql para ligar a conciliação.</AlertDescription>
        </Alert>
      ) : (
        <>
          {podeEscrever && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Importar extrato</CardTitle>
              </CardHeader>
              <CardContent>
                <ImportarExtratoForm />
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TileIndicador rotulo="Pendentes" valor={String(resumo.pendentes)} nota={`${moeda(resumo.pendentesDebitos)} em débitos · ${moeda(resumo.pendentesCreditos)} em créditos`} href="/painel/financeiro/conciliacao?situacao=pendente" />
            <TileIndicador rotulo="Conciliados" valor={String(resumo.conciliados)} nota={`${resumo.ignorados} ignorados`} href="/painel/financeiro/conciliacao?situacao=conciliado" />
            <TileIndicador rotulo="Ordens pagas sem extrato" valor={String(resumo.ordensSemExtrato)} nota="últimos 90 dias" subirEhBom={false} />
            <TileIndicador
              rotulo="Último extrato"
              valor={resumo.ultimoExtrato ? formatarData(resumo.ultimoExtrato.periodoAte ?? resumo.ultimoExtrato.criadoEm) : "—"}
              nota={resumo.ultimoExtrato ? `${resumo.ultimoExtrato.nomeArquivo ?? resumo.ultimoExtrato.origem} · ${resumo.ultimoExtrato.totalLancamentos} linhas` : "nenhum importado"}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {ABAS.map((a) => (
              <Button key={a.valor} variant={a.valor === situacao ? "default" : "outline"} size="sm" asChild>
                <Link href={`/painel/financeiro/conciliacao?situacao=${a.valor}${sp.extrato ? `&extrato=${sp.extrato}` : ""}`}>{a.rotulo}</Link>
              </Button>
            ))}
            {sp.extrato && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/painel/financeiro/conciliacao?situacao=${situacao}`}>Todos os extratos</Link>
              </Button>
            )}
          </div>

          <Card>
            <CardContent>
              {lancamentos.length === 0 ? (
                <p className="text-muted-foreground py-6 text-sm">
                  {situacao === "pendente" ? "Nada pendente. Importe o próximo extrato quando ele sair." : "Nenhum lançamento aqui."}
                </p>
              ) : (
                <ul className="divide-y">
                  {lancamentos.map((l) => (
                    <li key={l.id} className="grid gap-2 py-3 lg:grid-cols-[9rem_1fr_minmax(0,1.4fr)] lg:items-start">
                      <div>
                        <p className={`text-base font-semibold tabular-nums ${l.valor < 0 ? "" : "text-success-fg"}`}>{formatarMoeda(l.valor)}</p>
                        <p className="text-muted-foreground text-xs">{formatarData(l.data)}</p>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm">{l.descricao ?? "(sem descrição)"}</p>
                        <p className="text-muted-foreground text-xs">
                          {[l.tipo, l.documento ? `doc. ${l.documento}` : null].filter(Boolean).join(" · ")}
                          {l.vinculo ? ` · ${l.vinculo}` : ""}
                          {l.observacao ? ` · ${l.observacao}` : ""}
                        </p>
                        {l.situacao === "conciliado" && (
                          <Badge variant={l.automatico ? "secondary" : "outline"} className="mt-1">
                            {l.automatico ? "automático" : "manual"}
                            {l.conciliadoEm ? ` · ${formatarDataHora(l.conciliadoEm)}` : ""}
                          </Badge>
                        )}
                      </div>
                      <div>
                        {l.situacao === "pendente" ? (
                          l.ordens.length === 0 && l.comprovacoes.length === 0 && !podeEscrever ? (
                            <span className="text-muted-foreground text-xs">Sem candidata</span>
                          ) : (
                            <>
                              {l.ordens.length === 0 && l.comprovacoes.length === 0 && (
                                <p className="text-muted-foreground mb-1 text-xs">
                                  {l.valor < 0 ? "Nenhuma ordem paga com este valor até 3 dias de distância." : "Nenhum depósito registrado com este valor até 5 dias de distância."}
                                </p>
                              )}
                              <AcoesLancamento lancamentoId={l.id} valor={l.valor} ordens={l.ordens} comprovacoes={l.comprovacoes} remessas={opcoes.remessas} fontes={opcoes.fontes} podeEscrever={podeEscrever} />
                            </>
                          )
                        ) : podeEscrever ? (
                          <DesfazerBotao lancamentoId={l.id} />
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {lancamentos.length >= 300 && <p className="text-muted-foreground mt-2 text-xs">Mostrando os 300 mais recentes; filtre por extrato para ver o resto.</p>}
            </CardContent>
          </Card>

          {extratos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Extratos importados</CardTitle>
                <CardDescription className="text-xs">Clique num extrato para ver só os lançamentos dele.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {extratos.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0">
                        <Link href={`/painel/financeiro/conciliacao?situacao=${situacao}&extrato=${e.id}`} className="font-medium underline-offset-4 hover:underline">
                          {e.nomeArquivo ?? e.origem.toUpperCase()}
                        </Link>
                        <span className="text-muted-foreground block text-xs">
                          {[e.contaRotulo, e.banco ? `banco ${e.banco}` : null, e.conta ? `conta ${e.conta}` : null].filter(Boolean).join(" · ")}
                          {e.periodoDe && e.periodoAte ? ` · ${formatarData(e.periodoDe)} a ${formatarData(e.periodoAte)}` : ""}
                          {` · ${e.totalLancamentos} linhas, ${e.novosLancamentos} novas`}
                          {e.saldoFinal !== null ? ` · saldo ${formatarMoeda(e.saldoFinal)}` : ""}
                          {` · importado em ${formatarDataHora(e.criadoEm)}`}
                        </span>
                      </span>
                      {podeEscrever && <ExcluirExtratoBotao extratoId={e.id} nome={e.nomeArquivo ?? e.origem} />}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </>
  )
}
