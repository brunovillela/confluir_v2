import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CreditCard } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { rotuloTipoCartao, rotuloUsoCartao } from "@/lib/compras-constantes"
import { pessoasAutorizaveis } from "@/lib/db/caixa"
import { listarFaturasDoCartao } from "@/lib/db/cartao-faturas"
import { listarCartoes, nomeCartao } from "@/lib/db/compras-pagamento"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { SituacaoBadge } from "../../situacao-badge"
import { UsoCartaoForm } from "../cartao-form"

export const metadata: Metadata = { title: "Faturas do cartão — Confluir" }

export default async function CartaoPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await requirePermissao("financeiro_pagamento", ["financeiro_caixa", "financeiro_leitura"])
  const podeEditar = podeAcessar(sessao.permissoes, "financeiro_pagamento", ["financeiro_caixa"])
  const { id } = await params
  const { cartoes } = await listarCartoes()
  const cartao = cartoes.find((c) => c.id === id)
  if (!cartao) notFound()
  const [{ disponivel, faturas }, pessoas] = await Promise.all([
    listarFaturasDoCartao(id),
    podeEditar ? pessoasAutorizaveis() : Promise.resolve([]),
  ])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/financeiro/cartoes">
            <ArrowLeft />
            Cartões
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{nomeCartao(cartao)}</h1>
          <CreditCard className="text-muted-foreground size-5" />
          {!cartao.ativo && <Badge variant="secondary">Desativado</Badge>}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {rotuloTipoCartao(cartao.tipo)} · {rotuloUsoCartao(cartao.uso)}
          {cartao.titular ? ` · ${cartao.uso === "responsavel" ? "com" : "titular"} ${cartao.titular}` : ""}. Cada compra
          paga com este cartão entra na fatura aberta; no fechamento, o Financeiro gera uma ordem de pagamento com o
          rateio das compras.
          {cartao.uso === "responsavel" ? " O responsável também vê as faturas em Meu perfil › Meu cartão." : ""}
        </p>
      </div>

      {podeEditar && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Uso do cartão</CardTitle>
            <CardDescription>
              Corporativo: uso comum, a fatura fica só no Financeiro. Com um responsável: o cartão fica com a pessoa,
              que acompanha a fatura em Meu cartão.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UsoCartaoForm cartaoId={cartao.id} uso={cartao.uso} titularId={cartao.titularId} pessoas={pessoas} />
          </CardContent>
        </Card>
      )}

      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>Faturas indisponíveis — falta aplicar a migração cartao_faturas no banco.</AlertDescription>
        </Alert>
      )}
      {disponivel && cartao.tipo !== "credito" && (
        <Alert>
          <AlertDescription>Só cartões de crédito têm fatura. Compras no débito ou pré-pago seguem como ordens comuns.</AlertDescription>
        </Alert>
      )}

      {disponivel && cartao.tipo === "credito" && (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Fatura</TableHead>
                <TableHead className="hidden md:table-cell">Período</TableHead>
                <TableHead className="text-right">Compras</TableHead>
                <TableHead className="text-right">Valor da fatura</TableHead>
                <TableHead>Ordem</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {faturas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-20">
                    <p className="text-muted-foreground text-center text-sm">
                      Nenhuma fatura ainda — a primeira abre na primeira compra com este cartão.
                    </p>
                  </TableCell>
                </TableRow>
              )}
              {faturas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>
                    <Link href={`/painel/financeiro/cartoes/faturas/${f.id}`} className="font-medium hover:underline">
                      Nº {f.numero}
                    </Link>{" "}
                    <Badge variant={f.situacao === "aberta" ? "default" : "secondary"} className="ml-1">
                      {f.situacao === "aberta" ? "Aberta" : "Fechada"}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {formatarData(f.abertaEm.slice(0, 10))} a {f.fechadaEm ? formatarData(f.fechadaEm.slice(0, 10)) : "hoje"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarMoeda(f.soma)}
                    <span className="text-muted-foreground block text-xs">{f.compras} compra(s)</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {f.valorFatura === null ? "—" : formatarMoeda(f.valorFatura)}
                    {f.vencimento && <span className="text-muted-foreground block text-xs">vence {formatarData(f.vencimento)}</span>}
                  </TableCell>
                  <TableCell>
                    {f.ordemId ? (
                      <Link href={`/painel/financeiro/ordens/${f.ordemId}`} className="inline-flex flex-col gap-1 hover:underline">
                        <span className="text-xs">{f.ordemCodigo}</span>
                        <SituacaoBadge situacao={f.ordemSituacao} />
                      </Link>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
