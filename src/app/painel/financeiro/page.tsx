import type { Metadata } from "next"
import { CircleDollarSign, Receipt, Wallet } from "lucide-react"

import { CartaoArea } from "@/components/cartao-area"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarContasCaixa } from "@/lib/db/caixa"
import { listarOrdens, resumoFinanceiro } from "@/lib/db/financeiro"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { SituacaoBadge } from "./situacao-badge"

export const metadata: Metadata = { title: "Financeiro — Confluir" }

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

  const [resumo, ultimas, caixas] = await Promise.all([
    resumoFinanceiro(),
    veOrdens
      ? listarOrdens({ situacao: "todas", pagina: 1 })
      : Promise.resolve(null),
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

      {ultimas && ultimas.linhas.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimas ordens</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Favorecido
                    </TableHead>
                    <TableHead>Vencimento</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ultimas.linhas.slice(0, 8).map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {o.codigo ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-64 truncate font-medium">
                        {o.descricao ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden max-w-48 truncate md:table-cell">
                        {o.favorecido ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatarData(o.vencimento)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatarMoeda(o.valor_pago ?? o.valor_inicial_cobranca)}
                      </TableCell>
                      <TableCell>
                        <SituacaoBadge situacao={o.situacao} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
