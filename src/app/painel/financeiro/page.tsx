import type { Metadata } from "next"
import { CircleDollarSign, Receipt, Wallet } from "lucide-react"

import { CartaoArea } from "@/components/cartao-area"
import { Donut } from "@/components/grafico-donut"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarContasCaixa } from "@/lib/db/caixa"
import { resumoFinanceiro } from "@/lib/db/financeiro"
import { formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Financeiro — Confluir" }

/** Cores de marca (laranja/navy) por fatia de situação. */
const CORES_SITUACAO = [
  "var(--chart-marca-1)",
  "var(--chart-marca-2)",
  "var(--chart-marca-3)",
  "var(--chart-marca-4)",
]

export default async function FinanceiroPage() {
  const sessao = await requirePermissao("financeiro_caixa", [
    "financeiro_pagamento",
    "financeiro_leitura",
  ])

  const veOrdens = podeAcessar(sessao.permissoes, "financeiro_pagamento", [
    "financeiro_leitura",
  ])
  const veCaixa = podeAcessar(sessao.permissoes, "financeiro_caixa", [
    "financeiro_caixa_admin",
    "financeiro_leitura",
  ])

  const [resumo, caixas] = await Promise.all([
    resumoFinanceiro(),
    veCaixa
      ? listarContasCaixa()
      : Promise.resolve({ disponivel: false, contas: [] }),
  ])

  const caixasAbertas = caixas.contas.filter(
    (c) => c.ativa && c.situacao !== "fechada"
  )
  const saldoCaixas = caixasAbertas.reduce((acc, c) => acc + c.saldo, 0)

  const indicadores = [
    {
      titulo: "Ordens em aberto",
      valor: formatarMoeda(resumo.abertas.valor),
      detalhe: `${resumo.abertas.quantidade.toLocaleString("pt-BR")} ${resumo.abertas.quantidade === 1 ? "ordem" : "ordens"} aguardando`,
      icone: CircleDollarSign,
    },
    {
      titulo: "Pagas neste mês",
      valor: formatarMoeda(resumo.pagasNoMes.valor),
      detalhe: `${resumo.pagasNoMes.quantidade.toLocaleString("pt-BR")} pagamento${resumo.pagasNoMes.quantidade === 1 ? "" : "s"}`,
      icone: Receipt,
    },
    veCaixa && {
      titulo: "Saldo em contas de caixa",
      valor: formatarMoeda(saldoCaixas),
      detalhe: `${caixasAbertas.length.toLocaleString("pt-BR")} conta${caixasAbertas.length === 1 ? "" : "s"} aberta${caixasAbertas.length === 1 ? "" : "s"} · ${resumo.totalOrdens.toLocaleString("pt-BR")} ordens no total`,
      icone: Wallet,
    },
  ].filter(Boolean) as {
    titulo: string
    valor: string
    detalhe: string
    icone: typeof Wallet
  }[]

  const atalhos = [
    veOrdens && {
      titulo: "Ordens de pagamento",
      descricao: "Receitas e despesas com autorização e pagamento",
      href: "/painel/financeiro/ordens",
      icone: Receipt,
    },
    veOrdens && {
      titulo: "Centros de custo",
      descricao: "Plano de contas: códigos, classificadores e indicações",
      href: "/painel/financeiro/centros-custo",
      icone: CircleDollarSign,
    },
    veCaixa && {
      titulo: "Contas de caixa",
      descricao: "Dinheiro em espécie: aportes, extratos e prestação de contas",
      href: "/painel/financeiro/caixas",
      icone: Wallet,
    },
  ].filter(Boolean) as {
    titulo: string
    descricao: string
    href: string
    icone: typeof Receipt
  }[]

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Financeiro</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Visão geral das ordens de pagamento e do caixa.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {indicadores.map((ind) => (
          <Card key={ind.titulo}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardDescription>{ind.titulo}</CardDescription>
                <ind.icone className="text-muted-foreground size-4" />
              </div>
              <CardTitle className="text-2xl tabular-nums">
                {ind.valor}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-xs">{ind.detalhe}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {atalhos.map((a) => (
          <CartaoArea
            key={a.href}
            titulo={a.titulo}
            descricao={a.descricao}
            href={a.href}
            icone={a.icone}
          />
        ))}
      </div>

      {resumo.abertasPorSituacao.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Ordens em aberto por situação
            </CardTitle>
            <CardDescription>
              Onde estão as{" "}
              {resumo.abertas.quantidade.toLocaleString("pt-BR")} ordens que
              aguardam ação
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid items-center gap-6 sm:grid-cols-[auto_1fr]">
              <Donut
                className="size-36"
                fatias={resumo.abertasPorSituacao.map((s, i) => ({
                  cor: CORES_SITUACAO[i % CORES_SITUACAO.length],
                  valor: s.quantidade,
                }))}
                centroValor={resumo.abertas.quantidade.toLocaleString("pt-BR")}
                centroRotulo="em aberto"
              />
              <ul className="grid gap-1">
                {resumo.abertasPorSituacao.map((s, i) => (
                  <li
                    key={s.situacao}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-[3px]"
                      style={{
                        background: CORES_SITUACAO[i % CORES_SITUACAO.length],
                      }}
                    />
                    <span className="flex-1 truncate">{s.situacao}</span>
                    <span className="text-muted-foreground tabular-nums">
                      {s.quantidade.toLocaleString("pt-BR")}
                      {s.quantidade === 1 ? " ordem" : " ordens"}
                    </span>
                    <span className="w-32 text-right font-medium tabular-nums">
                      {formatarMoeda(s.valor)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
