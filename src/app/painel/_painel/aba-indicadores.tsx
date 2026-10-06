import Link from "next/link"
import { ArrowRight, FileText, RefreshCw } from "lucide-react"

import { atualizarAnaliticaAction } from "@/app/painel/indicadores/actions"
import { GraficoColunas } from "@/components/graficos/colunas"
import { GraficoLinha } from "@/components/graficos/linha"
import { compacto, moeda, rotuloMes } from "@/components/graficos/base"
import { Carrossel } from "@/components/painel/carrossel"
import { CartaoHud, KpiHud } from "@/components/painel/hud"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { SessaoPainel } from "@/lib/auth"
import { avisoAnalitica } from "@/lib/db/analitica"
import { painelExecutivo } from "@/lib/db/indicadores"
import { formatarDataHora } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { cn } from "@/lib/utils"

import { IndicadoresChurn } from "./indicadores-churn"
import { IndicadoresCustos } from "./indicadores-custos"
import { deltaPct } from "./util"

export type VistaIndicadores = "geral" | "churn" | "custos"

/** Quem vê a aba (mesma regra da antiga /painel/indicadores). */
export const CHAVES_INDICADORES = ["financeiro_leitura", "financeiro_pagamento", "filiacao_gestao", "filiacao_receitas", "diretoria_mandatos"]

export function vistasPermitidas(p: SessaoPainel["permissoes"]): VistaIndicadores[] {
  const v: VistaIndicadores[] = ["geral"]
  if (podeAcessar(p, "filiacao_gestao", ["filiacao_receitas", "configuracoes", "diretoria_mandatos"])) v.push("churn")
  if (podeAcessar(p, "configuracoes", CHAVES_INDICADORES)) v.push("custos")
  return v
}

const ROTULO_VISTA: Record<VistaIndicadores, string> = {
  geral: "Visão geral",
  churn: "Churn e retenção",
  custos: "Custos consolidados",
}

/**
 * INDICADORES — o painel executivo (filiação, arrecadação, caixa, despesa e o
 * vencido) com as vistas de churn e de custos como sub-abas. Antes eram três
 * páginas em /painel/indicadores.
 */
export async function AbaIndicadores({
  sessao,
  vista,
  atualizado,
  erro,
}: {
  sessao: SessaoPainel
  vista: VistaIndicadores
  atualizado?: string
  erro?: string
}) {
  const vistas = vistasPermitidas(sessao.permissoes)
  const atual = vistas.includes(vista) ? vista : "geral"

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav className="flex flex-wrap gap-1" aria-label="Vistas dos indicadores">
          {vistas.map((v) => (
            <Link
              key={v}
              href={`/painel?aba=gestao&ver=${v}`}
              scroll={false}
              aria-current={v === atual ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-xs transition-colors",
                v === atual
                  ? "border-primary/60 bg-primary/10 text-foreground shadow-[0_0_12px_-4px_var(--primary)]"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {ROTULO_VISTA[v]}
            </Link>
          ))}
        </nav>
      </div>
      {atual === "churn" ? <IndicadoresChurn /> : atual === "custos" ? <IndicadoresCustos /> : <VisaoGeral sessao={sessao} atualizado={atualizado} erro={erro} />}
    </div>
  )
}

async function VisaoGeral({ sessao, atualizado, erro }: { sessao: SessaoPainel; atualizado?: string; erro?: string }) {
  const painel = await painelExecutivo(sessao)
  const rotulos = painel.meses.map(rotuloMes)
  const podeAtualizar = podeAcessar(sessao.permissoes, "configuracoes")
  const ultima = painel.atualizacoes?.map((a) => a.atualizadoEm).sort().at(-1) ?? null
  const { filiacao, arrecadacao, financeiro } = painel
  const mesCorrente = painel.meses[painel.meses.length - 1].slice(0, 7)
  const mesAnterior = painel.meses[painel.meses.length - 2].slice(0, 7)

  const graficos: React.ReactNode[] = []
  if (painel.analiticaDisponivel && filiacao) {
    graficos.push(
      <CartaoHud key="ativos" titulo="Filiados ativos" descricao="Ao fim de cada mês; o mês corrente é o cadastro de hoje.">
        <div className="graf-neon">
          <GraficoLinha categorias={rotulos} valores={filiacao.ativosSerie} nome="Ativos" titulo="Filiados ativos por mês" altura={160} />
        </div>
      </CartaoHud>,
      <CartaoHud key="entradas" titulo="Filiações × desfiliações" descricao="Quem virou ativo e quem saiu, por mês.">
        <div className="graf-neon">
          <GraficoColunas
            altura={160}
            categorias={rotulos}
            series={[
              { nome: "Filiações", valores: filiacao.entradas },
              { nome: "Desfiliações", valores: filiacao.saidas },
            ]}
            titulo="Filiações e desfiliações por mês"
          />
        </div>
      </CartaoHud>
    )
  }
  if (painel.analiticaDisponivel && arrecadacao) {
    graficos.push(
      <CartaoHud key="arrec" titulo="Arrecadação por tipo" descricao="Remessas das fontes, por mês de referência.">
        {arrecadacao.porTipo.length ? (
          <div className="graf-neon">
            <GraficoColunas altura={160} categorias={rotulos} series={arrecadacao.porTipo} empilhado emMoeda titulo="Arrecadação mensal por tipo" />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Sem remessas nos últimos 12 meses.</p>
        )}
      </CartaoHud>
    )
  }
  if (painel.analiticaDisponivel && financeiro) {
    graficos.push(
      <CartaoHud key="desp" titulo="Despesa paga por tipo" descricao="Pelo mês do pagamento; o rateio é respeitado.">
        {financeiro.despesaPorTipo.length ? (
          <div className="graf-neon">
            <GraficoColunas altura={160} categorias={rotulos} series={financeiro.despesaPorTipo} empilhado emMoeda titulo="Despesa paga mensal por tipo" />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">Sem ordens pagas nos últimos 12 meses.</p>
        )}
      </CartaoHud>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          Últimos 12 meses.{ultima && <> Séries mensais atualizadas em {formatarDataHora(ultima)}.</>}
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="outline" size="sm" asChild>
            <a href={`/painel/indicadores/relatorio?mes=${mesAnterior}`} target="_blank" rel="noreferrer">
              <FileText />
              Relatório de {rotuloMes(`${mesAnterior}-01`)} (PDF)
            </a>
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href={`/painel/indicadores/relatorio?mes=${mesCorrente}`} target="_blank" rel="noreferrer">
              mês atual
            </a>
          </Button>
          {podeAtualizar && painel.analiticaDisponivel && (
            <form action={atualizarAnaliticaAction}>
              <Button type="submit" variant="ghost" size="sm">
                <RefreshCw />
                Atualizar
              </Button>
            </form>
          )}
        </div>
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
          <AlertDescription>{avisoAnalitica} Até lá, só os números de hoje (ativos, caixa, a pagar e vencidos) aparecem.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {filiacao && (
          <KpiHud
            rotulo="Filiados ativos"
            valor={filiacao.ativosHoje.toLocaleString("pt-BR")}
            delta={deltaPct(filiacao.ativosHoje, filiacao.ativosHa12Meses)}
            deltaRotulo="12 meses"
            sparkline={painel.analiticaDisponivel ? filiacao.ativosSerie : undefined}
            href="/painel/filiados"
            destaque
          />
        )}
        {arrecadacao && (
          <KpiHud
            rotulo={`Arrecadação${arrecadacao.ultimoMes ? ` · ${rotuloMes(arrecadacao.ultimoMes)}` : ""}`}
            valor={compacto(arrecadacao.valorUltimoMes, true)}
            delta={deltaPct(arrecadacao.valorUltimoMes, arrecadacao.valorMesAnterior)}
            deltaRotulo="mês anterior"
            nota={arrecadacao.pagantesUltimoMes ? `${arrecadacao.pagantesUltimoMes.toLocaleString("pt-BR")} pagantes` : undefined}
            href="/painel/filiados/receitas"
          />
        )}
        {financeiro && financeiro.saldoCaixa !== null && (
          <KpiHud rotulo="Saldo dos caixas" valor={compacto(financeiro.saldoCaixa, true)} href="/painel/financeiro/caixas" />
        )}
        {financeiro && (
          <KpiHud
            rotulo="A pagar em 30 dias"
            valor={compacto(financeiro.aPagar30d.valor, true)}
            nota={`${financeiro.aPagar30d.quantidade} ${financeiro.aPagar30d.quantidade === 1 ? "ordem" : "ordens"}`}
            href="/painel/financeiro/ordens?situacao=abertas"
          />
        )}
        {financeiro && (
          <KpiHud
            rotulo="Ordens vencidas"
            valor={financeiro.vencidas.quantidade.toLocaleString("pt-BR")}
            nota={financeiro.vencidas.quantidade ? compacto(financeiro.vencidas.valor, true) : "nenhuma"}
            href="/painel/financeiro/ordens?situacao=abertas&ordem=vencimento&dir=asc"
            alerta={financeiro.vencidas.quantidade > 0}
          />
        )}
        {filiacao?.inadimplentes && (
          <KpiHud
            rotulo="Inadimplentes"
            valor={filiacao.inadimplentes.configurado ? filiacao.inadimplentes.quantidade.toLocaleString("pt-BR") : "—"}
            nota={filiacao.inadimplentes.configurado ? undefined : "regra não configurada"}
            href="/painel/filiados/inadimplentes"
          />
        )}
      </div>

      {graficos.length > 0 && (
        <Carrossel colunas={2} rotulo="Gráficos dos indicadores">
          {graficos}
        </Carrossel>
      )}

      {painel.vencidos.length > 0 && (
        <CartaoHud titulo="Vencido nas áreas que você cuida" descricao="O mesmo recorte do resumo diário de vencimentos.">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {painel.vencidos.map((v) => (
              <li key={v.titulo}>
                <Link href={v.href} className="bg-muted/40 hover:bg-muted flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors">
                  <span className="min-w-0 truncate">{v.titulo}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="hud-numero text-destructive font-semibold">{v.quantidade}</span>
                    <ArrowRight className="text-muted-foreground size-3.5" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </CartaoHud>
      )}

      {financeiro && painel.analiticaDisponivel && (
        <p className="text-muted-foreground text-xs">
          Despesa paga no último mês fechado: <span className="hud-numero">{moeda(financeiro.despesaUltimoMes)}</span>. O detalhe por centro de custo e
          departamento fica no Financeiro gerencial.
        </p>
      )}
    </div>
  )
}
