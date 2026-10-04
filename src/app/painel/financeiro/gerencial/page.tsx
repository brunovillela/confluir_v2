import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ChartColumn } from "lucide-react"

import { GraficoColunas } from "@/components/graficos/colunas"
import { TileIndicador } from "@/components/graficos/tile"
import { compacto, moeda, rotuloMes } from "@/components/graficos/base"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { avisoAnalitica } from "@/lib/db/analitica"
import { hojeSP } from "@/lib/db/comum"
import {
  AVISO_SQL_ORCAMENTOS,
  despesaPor,
  fluxoProjetado,
  fontesEmAtraso,
  orcadoRealizado,
  ordensVencidas,
  type DimensaoDespesa,
} from "@/lib/db/financeiro-gerencial"
import { formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { cn } from "@/lib/utils"

import { OrcamentoForm } from "./orcamento-form"

export const metadata: Metadata = { title: "Financeiro gerencial — Confluir" }

const DIMENSOES: { chave: DimensaoDespesa; rotulo: string }[] = [
  { chave: "centro", rotulo: "Centro de custo" },
  { chave: "departamento", rotulo: "Departamento" },
  { chave: "tipo", rotulo: "Tipo de ordem" },
]

export default async function FinanceiroGerencialPage({ searchParams }: { searchParams: Promise<{ por?: string; ano?: string }> }) {
  const sessao = await requirePermissao("financeiro_leitura", ["financeiro_pagamento", "configuracoes"])
  const podeOrcar = podeAcessar(sessao.permissoes, "financeiro_pagamento")
  const sp = await searchParams
  const por: DimensaoDespesa = DIMENSOES.some((d) => d.chave === sp.por) ? (sp.por as DimensaoDespesa) : "centro"
  const anoAtual = Number(hojeSP().slice(0, 4))
  const ano = /^\d{4}$/.test(sp.ano ?? "") ? Number(sp.ano) : anoAtual

  const [fluxo, pivot, orcamento, vencidas, atraso] = await Promise.all([
    fluxoProjetado(4),
    despesaPor(por, 12),
    orcadoRealizado(ano),
    ordensVencidas(60),
    fontesEmAtraso().catch(() => ({ disponivel: false, fontes: [], mesEsperado: "" })),
  ])
  const rotulosFluxo = fluxo.meses.map((m) => rotuloMes(m.mes))
  const analitica = pivot.disponivel

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
          <ChartColumn className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Financeiro gerencial</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Fluxo projetado, despesa por centro de custo, orçado × realizado, ordens vencidas e fontes em atraso.
        </p>
      </div>

      {!analitica && (
        <Alert>
          <AlertDescription>{avisoAnalitica} Sem ela ficam só o fluxo projetado e as ordens vencidas.</AlertDescription>
        </Alert>
      )}

      {/* Fluxo projetado */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador
          rotulo="Vencidas"
          valor={compacto(fluxo.vencidas.valor, true)}
          nota={`${fluxo.vencidas.quantidade} ${fluxo.vencidas.quantidade === 1 ? "ordem" : "ordens"}`}
          href="#vencidas"
        />
        {fluxo.meses.slice(0, 3).map((m) => (
          <TileIndicador
            key={m.mes}
            rotulo={`A pagar em ${rotuloMes(m.mes)}`}
            valor={compacto(m.aPagar, true)}
            nota={`${m.ordens} ${m.ordens === 1 ? "ordem" : "ordens"}${m.receitaPrevista ? ` · receita prevista ${compacto(m.receitaPrevista, true)}` : ""}`}
            href={`/painel/financeiro/ordens?situacao=abertas&ordem=vencimento&dir=asc`}
          />
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Fluxo projetado</CardTitle>
          <CardDescription>
            Ordens abertas pelo mês de vencimento × receita prevista
            {fluxo.receitaBase.mesesBase.length
              ? ` (média de ${fluxo.receitaBase.mesesBase.map(rotuloMes).join(", ")}: ${moeda(fluxo.receitaBase.media)}/mês).`
              : " (sem remessas recentes para estimar a receita)."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <GraficoColunas
            categorias={rotulosFluxo}
            series={[
              { nome: "A pagar", valores: fluxo.meses.map((m) => m.aPagar) },
              { nome: "Receita prevista", valores: fluxo.meses.map((m) => m.receitaPrevista) },
            ]}
            emMoeda
            titulo="Fluxo projetado por mês"
          />
        </CardContent>
      </Card>

      {/* Despesa por dimensão */}
      {analitica && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Despesa paga nos últimos 12 meses</CardTitle>
                <CardDescription>Ordens pagas pelo mês do pagamento; o rateio é respeitado. Total: {moeda(pivot.total)}.</CardDescription>
              </div>
              <div className="flex gap-1">
                {DIMENSOES.map((d) => (
                  <Button key={d.chave} variant={por === d.chave ? "default" : "ghost"} size="sm" asChild>
                    <Link href={`/painel/financeiro/gerencial?por=${d.chave}&ano=${ano}`}>{d.rotulo}</Link>
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-48">{DIMENSOES.find((d) => d.chave === por)?.rotulo}</TableHead>
                  {pivot.meses.map((m) => (
                    <TableHead key={m} className="text-right whitespace-nowrap">
                      {rotuloMes(m)}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pivot.linhas.map((l) => (
                  <TableRow key={l.id ?? l.nome}>
                    <TableCell className="font-medium">{l.nome}</TableCell>
                    {l.valores.map((v, i) => (
                      <TableCell key={i} className={cn("text-right tabular-nums", v === 0 && "text-muted-foreground/50")}>
                        {v ? compacto(v) : "–"}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-medium tabular-nums">{compacto(l.total)}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/40">
                  <TableCell className="font-semibold">Total</TableCell>
                  {pivot.totalPorMes.map((v, i) => (
                    <TableCell key={i} className="text-right font-semibold tabular-nums">
                      {v ? compacto(v) : "–"}
                    </TableCell>
                  ))}
                  <TableCell className="text-right font-semibold tabular-nums">{compacto(pivot.total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Orçado × realizado */}
      {analitica && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Orçado × realizado por centro de custo — {ano}</CardTitle>
                <CardDescription>
                  Orçamento anual contra o pago no ano.
                  {ano === anoAtual && " A coluna “esperado” é a parcela do orçamento até o mês atual."}
                </CardDescription>
              </div>
              <div className="flex gap-1">
                {[anoAtual - 1, anoAtual, anoAtual + 1].map((a) => (
                  <Button key={a} variant={ano === a ? "default" : "ghost"} size="sm" asChild>
                    <Link href={`/painel/financeiro/gerencial?por=${por}&ano=${a}`}>{a}</Link>
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="grid gap-4">
            {!orcamento.orcamentosDisponiveis && (
              <Alert>
                <AlertDescription>{AVISO_SQL_ORCAMENTOS}</AlertDescription>
              </Alert>
            )}
            {orcamento.linhas.length > 0 && (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Centro de custo</TableHead>
                      <TableHead className="text-right">Orçado</TableHead>
                      {ano === anoAtual && <TableHead className="text-right">Esperado até agora</TableHead>}
                      <TableHead className="text-right">Realizado</TableHead>
                      <TableHead className="text-right">% do orçado</TableHead>
                      {podeOrcar && orcamento.orcamentosDisponiveis && <TableHead>Ajustar</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orcamento.linhas.map((l) => {
                      const estourou = l.orcado > 0 && l.realizado > l.orcado
                      const acima = ano === anoAtual && l.orcado > 0 && l.realizado > l.esperadoAteAgora * 1.1
                      return (
                        <TableRow key={l.centroId}>
                          <TableCell className="font-medium">{l.nome}</TableCell>
                          <TableCell className="text-right tabular-nums">{l.orcado ? moeda(l.orcado) : "–"}</TableCell>
                          {ano === anoAtual && <TableCell className="text-muted-foreground text-right tabular-nums">{l.orcado ? moeda(l.esperadoAteAgora) : "–"}</TableCell>}
                          <TableCell className="text-right tabular-nums">{moeda(l.realizado)}</TableCell>
                          <TableCell className="text-right">
                            {l.orcado ? (
                              <Badge variant="outline" className={cn(estourou ? "border-destructive/40 text-destructive" : acima ? "border-warning/40 text-warning-fg" : "border-success/40 text-success-fg")}>
                                {(l.pct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground text-xs">sem orçamento</span>
                            )}
                          </TableCell>
                          {podeOrcar && orcamento.orcamentosDisponiveis && (
                            <TableCell>
                              <OrcamentoForm ano={ano} centros={orcamento.centros} centroInicial={l.centroId} valorInicial={l.orcado} />
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    })}
                    <TableRow className="bg-muted/40">
                      <TableCell className="font-semibold">Total</TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">{moeda(orcamento.totalOrcado)}</TableCell>
                      {ano === anoAtual && <TableCell />}
                      <TableCell className="text-right font-semibold tabular-nums">{moeda(orcamento.totalRealizado)}</TableCell>
                      <TableCell />
                      {podeOrcar && orcamento.orcamentosDisponiveis && <TableCell />}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            )}
            {podeOrcar && orcamento.orcamentosDisponiveis && (
              <div className="grid gap-1.5">
                <p className="text-muted-foreground text-xs">Definir o orçamento anual de um centro de custo que ainda não aparece acima:</p>
                <OrcamentoForm ano={ano} centros={orcamento.centros.filter((c) => !orcamento.linhas.some((l) => l.centroId === c.id))} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Ordens vencidas */}
      <Card id="vencidas">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Ordens vencidas</CardTitle>
          <CardDescription>
            {vencidas.total ? `${vencidas.total} ${vencidas.total === 1 ? "ordem aberta" : "ordens abertas"} com vencimento passado, ${moeda(vencidas.valorTotal)} no total.` : "Nenhuma ordem aberta com vencimento passado."}
            {vencidas.total > vencidas.linhas.length && ` Mostrando as ${vencidas.linhas.length} mais antigas.`}
          </CardDescription>
        </CardHeader>
        {vencidas.linhas.length > 0 && (
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Favorecido</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead className="text-right">Vencimento</TableHead>
                  <TableHead className="text-right">Dias</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vencidas.linhas.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">
                      <Link href={`/painel/financeiro/ordens/${o.id}`} className="hover:underline">
                        {o.codigo ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-80 truncate">{o.descricao}</TableCell>
                    <TableCell>{o.favorecido ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">{o.situacao}</TableCell>
                    <TableCell className="text-right tabular-nums">{moeda(o.valor)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatarData(o.vencimento)}</TableCell>
                    <TableCell className="text-destructive text-right font-semibold tabular-nums">{o.dias}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>

      {/* Fontes em atraso */}
      {atraso.disponivel && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Fontes pagadoras com remessa em atraso</CardTitle>
            <CardDescription>
              Fontes com filiados ativos sem remessa de {atraso.mesEsperado ? rotuloMes(atraso.mesEsperado) : "mês passado"} para cá.
              {atraso.fontes.length === 0 && " Nenhuma — todas em dia."}
            </CardDescription>
          </CardHeader>
          {atraso.fontes.length > 0 && (
            <CardContent>
              <ul className="divide-y">
                {atraso.fontes.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0">
                    <Link href={`/painel/representacao/empregadores/${f.id}?aba=arrecadacao`} className="font-medium hover:underline">
                      {f.nome}
                    </Link>
                    <span className="text-muted-foreground text-xs">
                      {f.filiadosAtivos.toLocaleString("pt-BR")} ativos · última remessa {f.ultimoMes ? rotuloMes(f.ultimoMes) : "nunca"} ·{" "}
                      <span className="text-destructive font-medium">
                        {f.mesesSemRemessa >= 99 ? "sem remessa" : `${f.mesesSemRemessa} ${f.mesesSemRemessa === 1 ? "mês" : "meses"} sem remessa`}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          )}
        </Card>
      )}
    </>
  )
}
