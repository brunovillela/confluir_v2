import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import {
  fornecedoresRecorrentesSemContrato,
  MINIMO_COMPRAS_RECORRENTE,
  PERIODOS_RECORRENTES,
} from "@/lib/db/fornecedores-recorrentes"
import { formatarData, formatarMoeda } from "@/lib/formato"

export const metadata: Metadata = { title: "Fornecedores recorrentes sem contrato — Confluir" }

/**
 * Onde vale firmar contrato (17/11/2026): fornecedores com compras avulsas
 * repetidas que, somadas, passam do limite da aquisição direta.
 */
export default async function RecorrentesSemContratoPage({
  searchParams,
}: {
  searchParams: Promise<{ meses?: string }>
}) {
  await requirePermissao("aquisicoes_contratos", ["aquisicoes_contratos_edicao", "aquisicoes_compras"])
  const { meses: mesesTexto } = await searchParams
  const dados = await fornecedoresRecorrentesSemContrato({ meses: Number(mesesTexto) || 6 })
  const totalGeral = dados.linhas.reduce((s, l) => s + l.total, 0)

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/compras/contratos">
            <ArrowLeft />
            Contratos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Fornecedores recorrentes sem contrato</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-xs">
          Fornecedores com {MINIMO_COMPRAS_RECORRENTE} compras ou mais no período que, somadas, chegam ao limite da
          aquisição direta ({formatarMoeda(dados.totalMinimo)}, configurado em Financeiro → Auditoria das ordens) e não
          têm contrato em uso. Compra repetida feita como avulsa é onde vale firmar um contrato ou uma tabela de preços.
          Marketplaces ficam de fora (cada compra é de um vendedor diferente), assim como as compras canceladas.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-xs">Período:</span>
        {PERIODOS_RECORRENTES.map((m) => (
          <Button key={m} asChild size="sm" variant={dados.meses === m ? "default" : "outline"}>
            <Link href={`/painel/compras/contratos/recorrentes?meses=${m}`}>últimos {m} meses</Link>
          </Button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="grid gap-1">
            <span className="text-muted-foreground text-xs">Fornecedores</span>
            <span className="text-2xl font-semibold tabular-nums">{dados.linhas.length.toLocaleString("pt-BR")}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-1">
            <span className="text-muted-foreground text-xs">Comprado deles sem contrato</span>
            <span className="text-2xl font-semibold tabular-nums">{formatarMoeda(totalGeral)}</span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="grid gap-1">
            <span className="text-muted-foreground text-xs">Compras</span>
            <span className="text-2xl font-semibold tabular-nums">
              {dados.linhas.reduce((s, l) => s + l.compras, 0).toLocaleString("pt-BR")}
            </span>
            <span className="text-muted-foreground text-xs">desde {formatarData(dados.desde)}</span>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Por valor comprado</CardTitle>
          <CardDescription>
            {dados.linhas.length === 0
              ? "Nenhum fornecedor recorrente sem contrato no período."
              : "Abra o fornecedor para ver o histórico; as compras do período estão em cada linha."}
          </CardDescription>
        </CardHeader>
        {dados.linhas.length > 0 && (
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead className="text-right">Compras</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="hidden md:table-cell">Departamentos</TableHead>
                  <TableHead className="hidden sm:table-cell">Última</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dados.linhas.map((l) => (
                  <TableRow key={l.fornecedorId} className="align-top">
                    <TableCell className="max-w-[22rem] whitespace-normal">
                      <Link
                        href={`/painel/compras/fornecedores/${l.fornecedorId}`}
                        className="text-primary font-medium hover:underline"
                      >
                        {l.nome}
                      </Link>
                      <details className="mt-1">
                        <summary className="text-muted-foreground cursor-pointer text-xs">
                          ver as {l.compras} compras
                        </summary>
                        <ul className="mt-1 grid gap-0.5 text-xs">
                          {l.processos.map((p) => (
                            <li key={p.id} className="flex flex-wrap gap-x-2">
                              <Link href={`/painel/compras/${p.id}`} className="text-primary tabular-nums hover:underline">
                                {p.codigo ?? "(sem código)"}
                              </Link>
                              <span className="text-muted-foreground">{formatarData(p.data)}</span>
                              <span className="tabular-nums">{formatarMoeda(p.valor)}</span>
                            </li>
                          ))}
                        </ul>
                      </details>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.compras}
                      <span className="text-muted-foreground block text-xs">
                        em {l.meses} {l.meses === 1 ? "mês" : "meses"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatarMoeda(l.total)}</TableCell>
                    <TableCell className="hidden whitespace-normal md:table-cell">
                      <div className="flex flex-wrap gap-1">
                        {l.departamentos.length ? (
                          l.departamentos.map((d) => (
                            <Badge key={d} variant="outline" className="font-normal">
                              {d}
                            </Badge>
                          ))
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="hidden tabular-nums sm:table-cell">{formatarData(l.ultima)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
    </>
  )
}
