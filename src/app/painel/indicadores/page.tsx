import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, ChartColumn, RefreshCw } from "lucide-react"

import { GraficoColunas } from "@/components/graficos/colunas"
import { GraficoLinha } from "@/components/graficos/linha"
import { TileIndicador } from "@/components/graficos/tile"
import { compacto, moeda, rotuloMes } from "@/components/graficos/base"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { avisoAnalitica } from "@/lib/db/analitica"
import { painelExecutivo } from "@/lib/db/indicadores"
import { formatarDataHora } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { atualizarAnaliticaAction } from "./actions"

export const metadata: Metadata = { title: "Indicadores — Confluir" }

function delta(atual: number, anterior: number | null, pct = true): { texto: string; sinal: -1 | 0 | 1 } | null {
  if (anterior === null || anterior === undefined) return null
  const d = atual - anterior
  const sinal: -1 | 0 | 1 = d > 0 ? 1 : d < 0 ? -1 : 0
  if (pct && anterior !== 0) return { texto: `${d > 0 ? "+" : ""}${((d / anterior) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`, sinal }
  return { texto: `${d > 0 ? "+" : ""}${d.toLocaleString("pt-BR")}`, sinal }
}

export default async function IndicadoresPage({ searchParams }: { searchParams: Promise<{ atualizado?: string; erro?: string }> }) {
  const sessao = await requirePermissao("configuracoes", [
    "financeiro_leitura",
    "financeiro_pagamento",
    "filiacao_gestao",
    "filiacao_receitas",
    "diretoria_mandatos",
  ])
  const { atualizado, erro } = await searchParams
  const painel = await painelExecutivo(sessao)
  const rotulos = painel.meses.map(rotuloMes)
  const podeAtualizar = podeAcessar(sessao.permissoes, "configuracoes")
  const ultima = painel.atualizacoes?.map((a) => a.atualizadoEm).sort().at(-1) ?? null
  const { filiacao, arrecadacao, financeiro } = painel

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ChartColumn className="text-muted-foreground size-5" />
            <h1 className="text-2xl font-semibold tracking-tight">Indicadores</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            Filiação, arrecadação, caixa, despesa e o que está parado — os últimos 12 meses.
            {ultima && <> Séries mensais atualizadas em {formatarDataHora(ultima)}.</>}
          </p>
        </div>
        {podeAtualizar && painel.analiticaDisponivel && (
          <form action={atualizarAnaliticaAction}>
            <Button type="submit" variant="outline" size="sm">
              <RefreshCw />
              Atualizar agora
            </Button>
          </form>
        )}
      </div>

      {atualizado && (
        <Alert variant="success">
          <AlertDescription>Séries mensais recalculadas.</AlertDescription>
        </Alert>
      )}
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      {!painel.analiticaDisponivel && (
        <Alert>
          <AlertDescription>
            {avisoAnalitica} Até lá, só os números de hoje (ativos, caixa, a pagar e vencidos) aparecem.
          </AlertDescription>
        </Alert>
      )}

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {filiacao && (
          <TileIndicador
            rotulo="Filiados ativos"
            valor={filiacao.ativosHoje.toLocaleString("pt-BR")}
            delta={delta(filiacao.ativosHoje, filiacao.ativosHa12Meses)}
            deltaRotulo="em 12 meses"
            sparkline={painel.analiticaDisponivel ? filiacao.ativosSerie : undefined}
            href="/painel/filiados"
          />
        )}
        {arrecadacao && (
          <TileIndicador
            rotulo={`Arrecadação${arrecadacao.ultimoMes ? ` em ${rotuloMes(arrecadacao.ultimoMes)}` : ""}`}
            valor={compacto(arrecadacao.valorUltimoMes, true)}
            delta={delta(arrecadacao.valorUltimoMes, arrecadacao.valorMesAnterior)}
            deltaRotulo="vs. mês anterior"
            nota={arrecadacao.pagantesUltimoMes ? `${arrecadacao.pagantesUltimoMes.toLocaleString("pt-BR")} pagantes` : undefined}
            href="/painel/filiados/receitas"
          />
        )}
        {financeiro && financeiro.saldoCaixa !== null && (
          <TileIndicador rotulo="Saldo dos caixas" valor={compacto(financeiro.saldoCaixa, true)} href="/painel/financeiro/caixas" />
        )}
        {financeiro && (
          <TileIndicador
            rotulo="A pagar em 30 dias"
            valor={compacto(financeiro.aPagar30d.valor, true)}
            nota={`${financeiro.aPagar30d.quantidade} ${financeiro.aPagar30d.quantidade === 1 ? "ordem" : "ordens"}`}
            href="/painel/financeiro/ordens?situacao=abertas"
          />
        )}
        {financeiro && (
          <TileIndicador
            rotulo="Ordens vencidas"
            valor={financeiro.vencidas.quantidade.toLocaleString("pt-BR")}
            nota={financeiro.vencidas.quantidade ? compacto(financeiro.vencidas.valor, true) : "nenhuma"}
            href="/painel/financeiro/ordens?situacao=abertas&ordem=vencimento&dir=asc"
          />
        )}
        {filiacao?.inadimplentes && (
          <TileIndicador
            rotulo="Inadimplentes"
            valor={filiacao.inadimplentes.configurado ? filiacao.inadimplentes.quantidade.toLocaleString("pt-BR") : "—"}
            nota={filiacao.inadimplentes.configurado ? undefined : "regra não configurada"}
            href="/painel/filiados/inadimplentes"
          />
        )}
        <TileIndicador rotulo="Pendências na sua caixa" valor={painel.pendencias.toLocaleString("pt-BR")} href="/painel#caixa-entrada" />
      </div>

      {painel.analiticaDisponivel && (
        <div className="grid gap-4 lg:grid-cols-2">
          {filiacao && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Filiados ativos ao fim de cada mês</CardTitle>
                <CardDescription>Cadastros com condição “Ativo”; o mês corrente é o cadastro de hoje.</CardDescription>
              </CardHeader>
              <CardContent>
                <GraficoLinha categorias={rotulos} valores={filiacao.ativosSerie} nome="Ativos" titulo="Filiados ativos por mês" />
              </CardContent>
            </Card>
          )}
          {filiacao && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Filiações × desfiliações</CardTitle>
                <CardDescription>Quem virou ativo e quem saiu, por mês.</CardDescription>
              </CardHeader>
              <CardContent>
                <GraficoColunas
                  categorias={rotulos}
                  series={[
                    { nome: "Filiações", valores: filiacao.entradas },
                    { nome: "Desfiliações", valores: filiacao.saidas },
                  ]}
                  titulo="Filiações e desfiliações por mês"
                />
              </CardContent>
            </Card>
          )}
          {arrecadacao && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Arrecadação por tipo</CardTitle>
                <CardDescription>Valor informado nas remessas das fontes, por mês de referência.</CardDescription>
              </CardHeader>
              <CardContent>
                {arrecadacao.porTipo.length ? (
                  <GraficoColunas categorias={rotulos} series={arrecadacao.porTipo} empilhado emMoeda titulo="Arrecadação mensal por tipo" />
                ) : (
                  <p className="text-muted-foreground text-sm">Sem remessas nos últimos 12 meses.</p>
                )}
              </CardContent>
            </Card>
          )}
          {financeiro && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Despesa paga por tipo de ordem</CardTitle>
                <CardDescription>Ordens pagas, pelo mês do pagamento; o rateio é respeitado.</CardDescription>
              </CardHeader>
              <CardContent>
                {financeiro.despesaPorTipo.length ? (
                  <GraficoColunas categorias={rotulos} series={financeiro.despesaPorTipo} empilhado emMoeda titulo="Despesa paga mensal por tipo" />
                ) : (
                  <p className="text-muted-foreground text-sm">Sem ordens pagas nos últimos 12 meses.</p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {painel.vencidos.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Vencido nas áreas que você cuida</CardTitle>
            <CardDescription>O mesmo recorte do resumo diário de vencimentos.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {painel.vencidos.map((v) => (
                <li key={v.titulo}>
                  <Link href={v.href} className="group flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                    <span className="group-hover:underline group-hover:underline-offset-4">{v.titulo}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-destructive font-semibold tabular-nums">{v.quantidade}</span>
                      <ArrowRight className="text-muted-foreground size-4" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {financeiro && painel.analiticaDisponivel && (
        <p className="text-muted-foreground text-xs">
          Despesa paga no último mês fechado: {moeda(financeiro.despesaUltimoMes)}. Para o detalhe por centro de custo e departamento, veja o
          Financeiro gerencial (em construção nesta onda).
        </p>
      )}
    </>
  )
}
