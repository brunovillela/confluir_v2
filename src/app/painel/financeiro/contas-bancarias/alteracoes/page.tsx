import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Landmark } from "lucide-react"

import { ContaBancariaResumo, SituacaoAlteracaoBadge, camposAlterados } from "@/components/conta-bancaria-resumo"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { alteracoesParaOFinanceiro, type AlteracaoDadosBancarios } from "@/lib/db/meus-dados-bancarios"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { DecisaoAlteracao } from "./decisao"

export const metadata: Metadata = { title: "Dados bancários a confirmar — Confluir" }

const ACAO: Record<AlteracaoDadosBancarios["acao"], string> = {
  incluir: "Inclusão de conta",
  alterar: "Alteração de conta",
  excluir: "Exclusão de conta",
}

/**
 * Financeiro › Contas bancárias › Pedidos: o que funcionários e diretores
 * incluíram, alteraram ou excluíram no Meu perfil. Nada vale antes da
 * confirmação; confirmado, a conta ganha o selo "Financeiro ciente".
 */
export default async function AlteracoesDadosBancariosPage() {
  const sessao = await requirePermissao("financeiro_pagamento", ["financeiro_leitura"])
  const podeAgir = podeAcessar(sessao.permissoes, "financeiro_pagamento")
  const { disponivel, aguardando, decididas } = await alteracoesParaOFinanceiro()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/financeiro/contas-bancarias">
            <ArrowLeft />
            Contas bancárias
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Landmark className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Dados bancários a confirmar</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Contas que funcionários e diretores incluíram, alteraram ou excluíram no Meu perfil. Nada vale antes da sua
          confirmação — até lá os pagamentos seguem na conta antiga. Confira o titular antes de confirmar; quem pediu não
          confirma o próprio pedido.
        </p>
      </div>

      {!disponivel ? (
        <Alert variant="warning">
          <AlertDescription>A migração desta área ainda não foi aplicada no banco.</AlertDescription>
        </Alert>
      ) : (
        <>
          {aguardando.length === 0 ? (
            <Card>
              <CardContent>
                <p className="text-muted-foreground py-4 text-center text-sm">Nenhum pedido aguardando.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid items-start gap-4 xl:grid-cols-2">
              {aguardando.map((a) => (
                <Card key={a.id} className="border-warning/40 gap-3 py-4">
                  <CardContent className="grid gap-3 px-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{a.usuarioNome ?? "—"}</span>
                      <span className="flex flex-wrap items-center gap-2">
                        <Badge variant="outline">{ACAO[a.acao]}</Badge>
                        {a.principal && <Badge variant="secondary">Principal</Badge>}
                      </span>
                    </div>
                    <p className="text-muted-foreground -mt-2 text-xs">Pedido em {formatarDataHora(a.criadaEm)}</p>

                    {a.acao === "alterar" ? (
                      <div className="grid items-start gap-3 sm:grid-cols-[1fr_auto_1fr]">
                        <div className="grid gap-1">
                          <span className="text-muted-foreground text-xs font-semibold uppercase">Atual</span>
                          <ContaBancariaResumo conta={a.anteriores} />
                        </div>
                        <ArrowRight className="text-muted-foreground mt-6 hidden size-4 sm:block" />
                        <div className="grid gap-1">
                          <span className="text-muted-foreground text-xs font-semibold uppercase">Pedida</span>
                          <ContaBancariaResumo conta={a.dados} destaque={camposAlterados(a.anteriores, a.dados)} />
                        </div>
                      </div>
                    ) : (
                      <ContaBancariaResumo conta={a.acao === "excluir" ? a.anteriores : a.dados} />
                    )}

                    {podeAgir && (
                      <DecisaoAlteracao id={a.id} resumo={`a ${ACAO[a.acao].toLowerCase()} de ${a.usuarioNome ?? "esta pessoa"}`} />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {decididas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Decididos</CardTitle>
                <CardDescription>Os 100 pedidos mais recentes já confirmados, recusados ou cancelados</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pedido em</TableHead>
                      <TableHead>Pessoa</TableHead>
                      <TableHead>Pedido</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead className="hidden md:table-cell">Decisão</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {decididas.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="whitespace-nowrap tabular-nums">{formatarDataHora(a.criadaEm)}</TableCell>
                        <TableCell>{a.usuarioNome ?? "—"}</TableCell>
                        <TableCell>{ACAO[a.acao]}</TableCell>
                        <TableCell>
                          <SituacaoAlteracaoBadge situacao={a.situacao} />
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden text-xs md:table-cell">
                          {a.decididaEm && a.situacao !== "cancelada"
                            ? `${formatarData(a.decididaEm)}${a.decididaPor ? ` · ${a.decididaPor}` : ""}`
                            : a.situacao === "cancelada"
                              ? "Cancelado por quem pediu"
                              : "—"}
                          {a.motivo && <span className="text-destructive block">{a.motivo}</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </>
  )
}
