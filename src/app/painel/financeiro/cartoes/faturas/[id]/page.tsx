import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CreditCard, FileText } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { rotuloCentroCusto } from "@/lib/centros-custo-rotulo"
import { obterFatura, rateioDaFatura } from "@/lib/db/cartao-faturas"
import { urlArquivoOrdem } from "@/lib/db/ordens-extrato"
import { listarCentrosCusto } from "@/lib/db/financeiro"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { SITUACAO_NA_FATURA } from "@/lib/ordens-situacoes"
import { podeAcessar } from "@/lib/permissoes"

import { SituacaoBadge } from "../../../situacao-badge"
import { FaturaFechamento } from "../../fatura-fechamento"

export const metadata: Metadata = { title: "Fatura do cartão — Confluir" }

export default async function FaturaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ fechada?: string }>
}) {
  const sessao = await requirePermissao("financeiro_pagamento", ["financeiro_caixa", "financeiro_leitura"])
  const podeFechar = podeAcessar(sessao.permissoes, "financeiro_pagamento", ["financeiro_caixa"])
  const { id } = await params
  const { fechada } = await searchParams

  const det = await obterFatura(id)
  if (!det) notFound()
  const { fatura, cartao, itens } = det
  const contam = itens.filter((i) => i.conta)
  const pendentes = contam.filter((i) => i.situacao !== SITUACAO_NA_FATURA && i.situacao !== "Paga").length
  const aberta = fatura.situacao === "aberta"

  const [centros, urlFatura] = await Promise.all([
    (aberta && podeFechar) || fatura.centroDiferencaId ? listarCentrosCusto() : Promise.resolve([]),
    urlArquivoOrdem(fatura.arquivoFatura),
  ])
  const opcoesCentro = centros.filter((c) => c.usavel !== false).map((c) => ({ id: c.id, rotulo: rotuloCentroCusto(c) }))
  const dif = fatura.valorFatura === null ? 0 : Math.round((fatura.valorFatura - fatura.soma) * 100) / 100
  const nomeDif = fatura.centroDiferencaId
    ? (centros.find((c) => c.id === fatura.centroDiferencaId) ?? null)
    : null
  // Prévia (aberta) ou o rateio com que a ordem saiu (fechada).
  const rateio = rateioDaFatura(
    itens,
    !aberta && Math.abs(dif) >= 0.01
      ? { valor: dif, centroId: fatura.centroDiferencaId, centro: nomeDif ? rotuloCentroCusto(nomeDif) : "Centro da diferença", descricao: fatura.observacao ?? "Diferença da fatura" }
      : null
  )

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/painel/financeiro/cartoes/${cartao.id}`}>
            <ArrowLeft />
            {cartao.nome}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Fatura nº {fatura.numero}</h1>
          <CreditCard className="text-muted-foreground size-5" />
          <Badge variant={aberta ? "default" : "secondary"}>{aberta ? "Aberta" : "Fechada"}</Badge>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {cartao.nome}
          {cartao.titular ? ` · titular ${cartao.titular}` : ""} · aberta em {formatarData(fatura.abertaEm.slice(0, 10))}
          {fatura.fechadaEm ? ` · fechada em ${formatarData(fatura.fechadaEm.slice(0, 10))}${fatura.fechadaPor ? ` por ${fatura.fechadaPor}` : ""}` : ""}
        </p>
      </div>

      {fechada === "1" && fatura.ordemId && (
        <Alert variant="success">
          <AlertDescription>
            Fatura fechada. Ordem de pagamento{" "}
            <Link href={`/painel/financeiro/ordens/${fatura.ordemId}`} className="font-medium underline">
              {fatura.ordemCodigo}
            </Link>{" "}
            gerada ({fatura.ordemSituacao}). As próximas compras no cartão entram na fatura nº {fatura.numero + 1}.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Compras</CardDescription>
            <CardTitle className="text-xl">{formatarMoeda(fatura.soma)}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">{contam.length} compra(s){pendentes ? ` · ${pendentes} aguardando autorização` : ""}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Valor da fatura</CardDescription>
            <CardTitle className="text-xl">{fatura.valorFatura === null ? "—" : formatarMoeda(fatura.valorFatura)}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            {fatura.valorFatura === null
              ? "Informado no fechamento."
              : Math.abs(dif) >= 0.01
                ? `Diferença ${formatarMoeda(dif)}${fatura.vencimento ? ` · vence ${formatarData(fatura.vencimento)}` : ""}`
                : `Bate com as compras${fatura.vencimento ? ` · vence ${formatarData(fatura.vencimento)}` : ""}`}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Ordem de pagamento</CardDescription>
            <CardTitle className="text-xl">
              {fatura.ordemId ? (
                <Link href={`/painel/financeiro/ordens/${fatura.ordemId}`} className="hover:underline">
                  {fatura.ordemCodigo}
                </Link>
              ) : (
                "—"
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2 text-xs">
            {fatura.ordemSituacao ? <SituacaoBadge situacao={fatura.ordemSituacao} /> : <span className="text-muted-foreground">Gerada no fechamento.</span>}
            {urlFatura && (
              <a href={urlFatura} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
                <FileText className="size-3.5" />
                Fatura
              </a>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Compra</TableHead>
              <TableHead className="hidden md:table-cell">Data</TableHead>
              <TableHead className="hidden lg:table-cell">Centro de custo</TableHead>
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {itens.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-20">
                  <p className="text-muted-foreground text-center text-sm">Nenhuma compra nesta fatura.</p>
                </TableCell>
              </TableRow>
            )}
            {itens.map((i) => (
              <TableRow key={i.id} className={i.conta ? "" : "opacity-60"}>
                <TableCell className="max-w-80">
                  <Link href={`/painel/financeiro/ordens/${i.id}`} className="font-medium hover:underline">
                    {i.favorecido ?? i.codigo ?? "—"}
                  </Link>
                  <span className="text-muted-foreground block truncate text-xs">{i.descricao}</span>
                </TableCell>
                <TableCell className="hidden md:table-cell">{i.data ? formatarData(i.data) : "—"}</TableCell>
                <TableCell className="hidden lg:table-cell text-xs">
                  {i.rateio.length ? `Rateada (${i.rateio.length} centros)` : (i.centro ?? "—")}
                </TableCell>
                <TableCell>
                  <SituacaoBadge situacao={i.situacao} />
                </TableCell>
                <TableCell className={`text-right tabular-nums ${i.conta ? "" : "line-through"}`}>{formatarMoeda(i.valor)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{aberta ? "Rateio previsto" : "Rateio da ordem"}</CardTitle>
          <CardDescription>
            Pelos centros de custo das compras{aberta ? "; a diferença para o valor da fatura entra no centro escolhido no fechamento." : "."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rateio.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sem compras para ratear.</p>
          ) : (
            <ul className="divide-y text-sm">
              {rateio.map((l, n) => (
                <li key={n} className="flex items-baseline justify-between gap-3 py-1.5">
                  <span>
                    {l.centro ?? "Sem centro de custo"}
                    <span className="text-muted-foreground ml-2 text-xs">{l.descricao}</span>
                  </span>
                  <span className="tabular-nums">{formatarMoeda(l.valor)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {aberta && podeFechar && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Fechar a fatura</CardTitle>
            <CardDescription>
              Com a fatura do banco em mãos: informe o valor e o vencimento e anexe o arquivo. O sistema gera a ordem de
              pagamento rateada e abre a próxima fatura do cartão.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FaturaFechamento faturaId={fatura.id} soma={fatura.soma} compras={contam.length} pendentes={pendentes} centros={opcoesCentro} />
          </CardContent>
        </Card>
      )}
    </>
  )
}
