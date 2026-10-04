import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Wallet } from "lucide-react"

import { GraficoColunas } from "@/components/graficos/colunas"
import { TileIndicador } from "@/components/graficos/tile"
import { moeda, rotuloMes } from "@/components/graficos/base"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { avisoAnalitica } from "@/lib/db/analitica"
import { custosConsolidados } from "@/lib/db/custos"
import { formatarMoeda } from "@/lib/formato"

export const metadata: Metadata = { title: "Custos consolidados — Confluir" }

const ALT = ["financeiro_leitura", "financeiro_pagamento", "filiacao_gestao", "filiacao_receitas", "diretoria_mandatos"]

/** Frota, hospedagem, viagens e diárias nos últimos 12 meses (onda 4, I7). */
export default async function CustosPage() {
  await requirePermissao("configuracoes", ALT)
  const c = await custosConsolidados()
  const total = c.frota.total + c.hospedagem.total + c.viagens.total + c.diarias.total
  const n = (v: number, d = 1) => v.toLocaleString("pt-BR", { maximumFractionDigits: d })

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/indicadores">
            <ArrowLeft />
            Indicadores
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Wallet className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Custos consolidados</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Frota por veículo e por km, hospedagem por hotel, viagens e diárias por pessoa e por departamento — últimos 12 meses.
        </p>
      </div>

      {!c.frota.disponivel && (
        <Alert>
          <AlertDescription>{avisoAnalitica} Até lá, a frota não entra na conta.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <TileIndicador rotulo="Total em 12 meses" valor={moeda(total)} nota="frota + hospedagem + viagens + diárias" />
        <TileIndicador rotulo="Frota" valor={moeda(c.frota.total)} nota={c.frota.km ? `${n(c.frota.km, 0)} km · ${moeda(c.frota.total / c.frota.km)}/km` : "sem km registrado"} />
        <TileIndicador rotulo="Hospedagem" valor={moeda(c.hospedagem.total)} nota={`${c.hospedagem.quartos} quarto${c.hospedagem.quartos === 1 ? "" : "s"}`} />
        <TileIndicador rotulo="Viagens" valor={moeda(c.viagens.total)} nota={`${c.viagens.quantidade} ${c.viagens.quantidade === 1 ? "viagem" : "viagens"}`} />
        <TileIndicador rotulo="Diárias" valor={moeda(c.diarias.total)} nota={`${c.diarias.quantidade} aprovada${c.diarias.quantidade === 1 ? "" : "s"}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por mês</CardTitle>
          <CardDescription className="text-xs">Empilhado: frota, hospedagem, viagens e diárias.</CardDescription>
        </CardHeader>
        <CardContent>
          <GraficoColunas
            titulo="Custos por mês"
            categorias={c.meses.map((m) => rotuloMes(`${m}-01`))}
            empilhado
            emMoeda
            series={[
              { nome: "Frota", valores: c.porMes.map((m) => m.frota) },
              { nome: "Hospedagem", valores: c.porMes.map((m) => m.hospedagem) },
              { nome: "Viagens", valores: c.porMes.map((m) => m.viagens) },
              { nome: "Diárias", valores: c.porMes.map((m) => m.diarias) },
            ]}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Frota por veículo</CardTitle>
            <CardDescription className="text-xs">Abastecimento, manutenção, multas e aluguel; custo por km rodado.</CardDescription>
          </CardHeader>
          <CardContent>
            {c.frota.veiculos.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sem custos de frota no período.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Veículo</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">km</TableHead>
                    <TableHead className="text-right">R$/km</TableHead>
                    <TableHead className="text-right">km/l</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.frota.veiculos.map((v) => (
                    <TableRow key={v.veiculoId}>
                      <TableCell>
                        <Link href={`/painel/veiculos/${v.veiculoId}`} className="underline-offset-4 hover:underline">
                          {[v.placa, v.modelo].filter(Boolean).join(" · ") || "Veículo"}
                        </Link>
                        <span className="text-muted-foreground block text-xs">
                          abast. {formatarMoeda(v.abastecimento)} · manut. {formatarMoeda(v.manutencao)}
                          {v.multas ? ` · multas ${formatarMoeda(v.multas)}` : ""}
                          {v.aluguel ? ` · aluguel ${formatarMoeda(v.aluguel)}` : ""}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(v.total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{n(v.km, 0)}</TableCell>
                      <TableCell className="text-right tabular-nums">{v.custoKm === null ? "—" : formatarMoeda(v.custoKm)}</TableCell>
                      <TableCell className="text-right tabular-nums">{v.kmPorLitro === null ? "—" : n(v.kmPorLitro)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Hospedagem por hotel</CardTitle>
            <CardDescription className="text-xs">Custo da entidade nas reservas efetivadas (check-in no período).</CardDescription>
          </CardHeader>
          <CardContent>
            {c.hospedagem.hoteis.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sem reservas com custo no período.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hotel</TableHead>
                    <TableHead className="text-right">Quartos</TableHead>
                    <TableHead className="text-right">Hóspedes</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Média/quarto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.hospedagem.hoteis.map((h) => (
                    <TableRow key={h.hotelId}>
                      <TableCell>{h.hotel}</TableCell>
                      <TableCell className="text-right tabular-nums">{h.quartos}</TableCell>
                      <TableCell className="text-right tabular-nums">{h.hospedes}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(h.total)}</TableCell>
                      <TableCell className="text-right tabular-nums">{h.mediaPorQuarto === null ? "—" : formatarMoeda(h.mediaPorQuarto)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Viagens e diárias por pessoa</CardTitle>
            <CardDescription className="text-xs">Diretores, funcionários e convidados; os 30 maiores.</CardDescription>
          </CardHeader>
          <CardContent>
            {c.pessoas.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sem viagens ou diárias com valor no período.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Pessoa</TableHead>
                    <TableHead className="text-right">Viagens</TableHead>
                    <TableHead className="text-right">Diárias</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.pessoas.map((p) => (
                    <TableRow key={p.chave}>
                      <TableCell>
                        {p.nome}
                        {p.departamento && <span className="text-muted-foreground block text-xs">{p.departamento}</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatarMoeda(p.valorViagens)}
                        <span className="text-muted-foreground block text-xs">{p.viagens}</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatarMoeda(p.valorDiarias)}
                        <span className="text-muted-foreground block text-xs">{p.diarias}</span>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatarMoeda(p.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Viagens e diárias por departamento</CardTitle>
          </CardHeader>
          <CardContent>
            {c.departamentos.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sem viagens ou diárias com valor no período.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Departamento</TableHead>
                    <TableHead className="text-right">Viagens</TableHead>
                    <TableHead className="text-right">Diárias</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.departamentos.map((d) => (
                    <TableRow key={d.departamento}>
                      <TableCell>{d.departamento}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(d.valorViagens)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatarMoeda(d.valorDiarias)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">{formatarMoeda(d.total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
