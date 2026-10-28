import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, BookText, Download, Lock } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { avisoAnalitica } from "@/lib/db/analitica"
import { hojeSP } from "@/lib/db/comum"
import { lancamentosContabeis } from "@/lib/db/contabil"
import { rpasPagosNoPeriodo, totalizarRpas } from "@/lib/db/contabil-rpa"
import { listarMesesFechados } from "@/lib/db/meses-fechados"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { FechamentoMeses, type LinhaMes } from "./fechamento-meses"

import { periodoContabil } from "./periodo"

export const metadata: Metadata = { title: "Exportação contábil — Confluir" }

/** Escolhe o período, confere os totais e baixa o XLSX (onda 4, I4). */
export default async function ContabilPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string }> }) {
  const sessao = await requirePermissao("financeiro_leitura", ["financeiro_pagamento"])
  const sp = await searchParams
  const { de, ate } = periodoContabil(sp.de, sp.ate)
  const [l, fechados, rpas] = await Promise.all([lancamentosContabeis(de, ate), listarMesesFechados(), rpasPagosNoPeriodo(de, ate)])
  const tr = totalizarRpas(rpas)
  const ordensPagas = new Set(l.despesas.map((d) => d.id.split(":")[0])).size
  // Os últimos 12 meses, do atual para trás, mais os fechados mais antigos.
  const [ano, mesAtual] = hojeSP().split("-").map(Number)
  const ultimos = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(ano, mesAtual - 1 - i, 1)).toISOString().slice(0, 7))
  const meses: LinhaMes[] = [...new Set([...ultimos, ...fechados.map((f) => f.mes)])]
    .sort((a, b) => b.localeCompare(a))
    .map((mes) => ({ mes, fechamento: fechados.find((f) => f.mes === mes) ?? null }))
  const porCentro = new Map<string, number>()
  for (const d of l.despesas) porCentro.set(d.centroCusto ?? "Sem centro de custo", (porCentro.get(d.centroCusto ?? "Sem centro de custo") ?? 0) + d.valorPago)
  const centros = [...porCentro.entries()].sort((a, b) => b[1] - a[1])
  const query = `de=${de}&ate=${ate}`

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/financeiro">
            <ArrowLeft />
            Financeiro
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <BookText className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Exportação contábil</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Os lançamentos de um período em planilha, com centro de custo, departamento, favorecido e CNPJ/CPF: a aba Despesas traz as ordens pagas pela data do pagamento; a aba Receitas, a arrecadação por competência, tipo e fonte; a aba RPAs, os recibos de autônomo pagos no período com bruto, retenções e INSS patronal.
        </p>
      </div>

      <Card>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="de">De</Label>
              <Input id="de" name="de" type="date" defaultValue={de} className="w-44" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ate">Até</Label>
              <Input id="ate" name="ate" type="date" defaultValue={ate} className="w-44" />
            </div>
            <Button type="submit" variant="outline">
              Conferir período
            </Button>
            <Button asChild>
              <a href={`/painel/financeiro/contabil/exportar?${query}`}>
                <Download />
                Baixar XLSX
              </a>
            </Button>
          </form>
        </CardContent>
      </Card>

      {!l.receitasDisponiveis && (
        <Alert>
          <AlertDescription>{avisoAnalitica} Até lá, a aba Receitas sai vazia.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Despesas — {formatarData(de)} a {formatarData(ate)}</CardTitle>
            <CardDescription className="text-xs">
              {ordensPagas} {ordensPagas === 1 ? "ordem paga" : "ordens pagas"}
              {l.despesas.length > ordensPagas ? ` (${l.despesas.length} linhas com o rateio)` : ""} · {formatarMoeda(l.totalDespesas)}
              {l.despesas.some((d) => !d.centroCusto) ? ` · ${l.despesas.filter((d) => !d.centroCusto).length} sem centro de custo` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {centros.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma ordem paga no período.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Centro de custo</TableHead>
                    <TableHead className="text-right">Valor pago</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {centros.map(([nome, valor]) => (
                    <TableRow key={nome}>
                      <TableCell className={nome === "Sem centro de custo" ? "text-destructive" : ""}>{nome}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(valor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Receitas</CardTitle>
            <CardDescription className="text-xs">
              {l.receitas.length} linha{l.receitas.length === 1 ? "" : "s"} (competência × tipo × fonte) · {formatarMoeda(l.totalReceitas)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {l.receitas.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma arrecadação no período.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Competência</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Fonte</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {l.receitas.slice(0, 40).map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="tabular-nums">{r.mes.slice(5, 7)}/{r.mes.slice(0, 4)}</TableCell>
                      <TableCell>{r.tipo}</TableCell>
                      <TableCell>{r.fonte ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(r.valor)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            {l.receitas.length > 40 && <p className="text-muted-foreground mt-2 text-xs">Mostrando 40 de {l.receitas.length}; a planilha traz todas.</p>}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">RPAs pagos no período</CardTitle>
          <CardDescription className="text-xs">
            Na aba Despesas, a ordem do RPA aparece pelo líquido pago. Para a contabilidade lançar a despesa e as
            obrigações, a aba RPAs traz cada recibo com o bruto, as retenções a recolher e a cota patronal do INSS
            (encargo da entidade) — as mesmas que formam as guias do mês em Financeiro › Tributos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rpas.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum RPA pago no período.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>RPAs</TableHead>
                  <TableHead className="text-right">Bruto</TableHead>
                  <TableHead className="text-right">INSS retido</TableHead>
                  <TableHead className="text-right">IRRF</TableHead>
                  <TableHead className="text-right">ISS</TableHead>
                  <TableHead className="text-right">Líquido</TableHead>
                  <TableHead className="text-right">INSS patronal</TableHead>
                  <TableHead className="text-right">Custo total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="tabular-nums">{tr.quantidade}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(tr.bruto)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(tr.inss)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(tr.irrf)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(tr.iss)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(tr.liquido)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatarMoeda(tr.inssPatronal)}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{formatarMoeda(tr.custoTotal)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
          {rpas.some((r) => !r.assinado) && (
            <p className="text-warning-fg mt-2 text-xs">
              {rpas.filter((r) => !r.assinado).length} RPA(s) pago(s) sem o recibo assinado anexado — a planilha
              marca quais.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lock className="size-4" />
            Fechamento do mês
          </CardTitle>
          <CardDescription className="text-xs">
            Feche o mês quando a contabilidade receber a planilha: daí em diante, o centro de custo, o departamento e o
            rateio das ordens pagas nele (pela data do pagamento) não podem mais ser reclassificados. Em mês aberto, o
            Financeiro reclassifica pela página da ordem.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FechamentoMeses meses={meses} podeFechar={podeAcessar(sessao.permissoes, "financeiro_pagamento")} />
        </CardContent>
      </Card>
    </>
  )
}
