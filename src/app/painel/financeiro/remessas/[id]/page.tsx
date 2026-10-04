import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Download } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { obterRemessa, rotuloForma } from "@/lib/db/remessas"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { CancelarRemessaBotao, MarcarEnviadaBotao, RetornoForm } from "./remessa-acoes"

export const metadata: Metadata = { title: "Remessa — Confluir" }

const ROTULO: Record<string, string> = { gerada: "Gerada", enviada: "Enviada ao banco", retornada: "Com retorno", cancelada: "Cancelada" }
const VARIANTE_ITEM: Record<string, "secondary" | "success" | "destructive" | "outline"> = { enviado: "secondary", pago: "success", rejeitado: "destructive", cancelado: "outline" }

export default async function RemessaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ gerada?: string }> }) {
  const sessao = await requirePermissao("financeiro_pagamento", ["financeiro_leitura"])
  const podeEscrever = podeAcessar(sessao.permissoes, "financeiro_pagamento")
  const { id } = await params
  const { gerada } = await searchParams
  const r = await obterRemessa(id)
  if (!r) notFound()
  const { remessa, itens } = r
  const aberta = remessa.situacao === "gerada" || remessa.situacao === "enviada"

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
            <Link href="/painel/financeiro/remessas">
              <ArrowLeft />
              Remessas
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Remessa {remessa.numero}</h1>
            <Badge variant={remessa.situacao === "retornada" ? "success" : remessa.situacao === "cancelada" ? "outline" : remessa.situacao === "enviada" ? "warning" : "secondary"}>{ROTULO[remessa.situacao]}</Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {remessa.arquivoNome} · conta {remessa.contaApelido} · {remessa.totalItens} ite{remessa.totalItens === 1 ? "m" : "ns"} · {formatarMoeda(remessa.totalValor)} · gerada em {formatarDataHora(remessa.geradaEm)}
            {remessa.retornoEm ? ` · retorno em ${formatarDataHora(remessa.retornoEm)}${remessa.retornoNome ? ` (${remessa.retornoNome})` : ""}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={`/painel/financeiro/remessas/${id}/arquivo`}>
              <Download />
              Baixar arquivo
            </a>
          </Button>
          {remessa.retornoEm && (
            <Button variant="outline" asChild>
              <a href={`/painel/financeiro/remessas/${id}/arquivo?retorno=1`}>
                <Download />
                Retorno
              </a>
            </Button>
          )}
        </div>
      </div>

      {gerada && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Remessa gerada. Baixe o arquivo, envie pelo internet banking e, quando o banco devolver o retorno, importe-o aqui.</AlertDescription>
        </Alert>
      )}

      {podeEscrever && aberta && (
        <div className="flex flex-wrap items-center gap-3">
          {remessa.situacao === "gerada" && <MarcarEnviadaBotao remessaId={id} />}
          <CancelarRemessaBotao remessaId={id} numero={remessa.numero} />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Itens</CardTitle>
          <CardDescription className="text-xs">Um por ordem; o &quot;Seu número&quot; é o código da ordem.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Ordem</TableHead>
                <TableHead>Favorecido</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((i) => (
                <TableRow key={i.id}>
                  <TableCell className="tabular-nums">{i.seq}</TableCell>
                  <TableCell>
                    <Link href={`/painel/financeiro/ordens/${i.ordemId}`} className="underline-offset-4 hover:underline">
                      {i.ordemCodigo ?? i.ordemId.slice(0, 8)}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {i.favorecidoNome ?? "—"}
                    {i.favorecidoDocumento && <span className="text-muted-foreground block text-xs">{i.favorecidoDocumento}</span>}
                  </TableCell>
                  <TableCell className="text-xs">{i.destino}</TableCell>
                  <TableCell className="text-xs">{rotuloForma(i.formaLancamento)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatarData(i.dataPagamento)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(i.valor)}</TableCell>
                  <TableCell>
                    <Badge variant={VARIANTE_ITEM[i.situacao]}>{i.situacao}</Badge>
                    {i.ocorrenciaDescricao && (
                      <span className="text-muted-foreground block max-w-56 text-xs">
                        {i.ocorrenciaDescricao}
                        {i.retornoData ? ` · ${formatarData(i.retornoData)}` : ""}
                        {i.retornoValor !== null && Math.abs(i.retornoValor - i.valor) >= 0.005 ? ` · banco: ${formatarMoeda(i.retornoValor)}` : ""}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {podeEscrever && remessa.situacao !== "cancelada" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{remessa.retornoEm ? "Importar outro retorno" : "Importar o retorno do banco"}</CardTitle>
          </CardHeader>
          <CardContent>
            <RetornoForm remessaId={id} />
          </CardContent>
        </Card>
      )}
    </>
  )
}
