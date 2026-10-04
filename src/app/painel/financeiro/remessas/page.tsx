import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, FileOutput, Landmark, Plus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarContasBancarias, listarRemessas } from "@/lib/db/remessas"
import { formatarDataHora, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Remessas bancárias — Confluir" }

const ROTULO: Record<string, string> = { gerada: "Gerada", enviada: "Enviada ao banco", retornada: "Com retorno", cancelada: "Cancelada" }
const VARIANTE: Record<string, "secondary" | "warning" | "success" | "outline"> = { gerada: "secondary", enviada: "warning", retornada: "success", cancelada: "outline" }

/** Arquivos de pagamento gerados das ordens "A pagar" e seus retornos (onda 5, A2). */
export default async function RemessasPage() {
  const sessao = await requirePermissao("financeiro_pagamento", ["financeiro_leitura"])
  const podeEscrever = podeAcessar(sessao.permissoes, "financeiro_pagamento")
  const [{ disponivel, remessas }, { contas }] = await Promise.all([listarRemessas(), listarContasBancarias()])
  const contasAtivas = contas.filter((c) => c.ativa)

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
            <Link href="/painel/financeiro">
              <ArrowLeft />
              Financeiro
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <FileOutput className="text-muted-foreground size-5" />
            <h1 className="text-2xl font-semibold tracking-tight">Remessas bancárias</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            As ordens &quot;A pagar&quot; viram um arquivo CNAB 240 para o internet banking; o retorno do banco marca cada uma paga ou rejeitada.
          </p>
        </div>
        {podeEscrever && disponivel && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/painel/financeiro/remessas/contas">
                <Landmark />
                Contas bancárias
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/painel/financeiro/remessas/nova">
                <Plus />
                Nova remessa
              </Link>
            </Button>
          </div>
        )}
      </div>

      {!disponivel ? (
        <Alert>
          <AlertDescription>Falta rodar o SQL supabase/financeiro-remessas.sql para ligar as remessas.</AlertDescription>
        </Alert>
      ) : contasAtivas.length === 0 ? (
        <Alert>
          <AlertDescription>
            Cadastre a conta bancária de onde a entidade paga em <Link href="/painel/financeiro/remessas/contas?nova=1" className="underline underline-offset-4">Contas bancárias</Link> para gerar a primeira remessa.
          </AlertDescription>
        </Alert>
      ) : null}

      {disponivel && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Remessas</CardTitle>
            <CardDescription className="text-xs">Mais recentes primeiro. Abra uma remessa para baixar o arquivo, marcar como enviada ou importar o retorno.</CardDescription>
          </CardHeader>
          <CardContent>
            {remessas.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma remessa gerada ainda.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº</TableHead>
                    <TableHead>Conta</TableHead>
                    <TableHead>Arquivo</TableHead>
                    <TableHead className="text-right">Itens</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    <TableHead>Gerada em</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {remessas.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="tabular-nums">{r.numero}</TableCell>
                      <TableCell>{r.contaApelido}</TableCell>
                      <TableCell>
                        <Link href={`/painel/financeiro/remessas/${r.id}`} className="font-medium underline-offset-4 hover:underline">
                          {r.arquivoNome}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.totalItens}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(r.totalValor)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatarDataHora(r.geradaEm)}</TableCell>
                      <TableCell>
                        <Badge variant={VARIANTE[r.situacao]}>{ROTULO[r.situacao]}</Badge>
                        {r.retornoResumo && (
                          <span className="text-muted-foreground block text-xs">
                            {r.retornoResumo.pagos} paga(s) · {r.retornoResumo.rejeitados} rejeitada(s)
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
