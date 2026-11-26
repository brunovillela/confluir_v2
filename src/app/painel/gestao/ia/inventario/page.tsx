import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Boxes, FileSpreadsheet } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { obterConfigIA } from "@/lib/db/ia-config"
import { obterInventarioIA } from "@/lib/db/ia-inventario"
import { formatarData } from "@/lib/formato"
import { formatarTempo } from "@/lib/ia-inventario"
import { MODULOS_IA, PROCESSOS_IA } from "@/lib/ia-processos"

import { Indicador } from "../uso"
import { MinutosForm, type GrupoMinutos } from "./minutos-form"
import { intervaloInventario, PERIODOS_INVENTARIO } from "./periodos"

export const metadata: Metadata = { title: "Inventário da IA — Confluir" }

const ROTA = "/painel/gestao/ia/inventario"

const inteiro = new Intl.NumberFormat("pt-BR")

/** Custo por operação: frações de centavo aparecem (US$ 0,0031). */
function usdMedio(n: number | null): string {
  if (n === null) return "—"
  if (n === 0) return "US$ 0"
  const casas = n >= 1 ? 2 : n >= 0.01 ? 3 : 4
  return `US$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`
}

function usd(n: number | null): string {
  if (n === null) return "—"
  if (n > 0 && n < 0.01) return "< US$ 0,01"
  return `US$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function reais(n: number | null, cotacao: number | null, casas = 2): string | null {
  if (n === null || !cotacao) return null
  return `R$ ${(n * cotacao).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`
}

export default async function InventarioIAPage({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  await requirePermissao("gestao_sistema")
  const sp = await searchParams
  const periodo = PERIODOS_INVENTARIO.find((p) => p.valor === sp.periodo)?.valor ?? "tudo"
  const { de, ate } = intervaloInventario(periodo)
  const [config, { disponivel, inventario, ajustes }] = await Promise.all([obterConfigIA(), obterInventarioIA(de, ate)])
  const cot = config.cotacaoUsdBrl
  const t = inventario.total
  const temPrecos =
    (config.precoEntrada !== null && config.precoSaida !== null) ||
    Object.values(config.precosModelos).some((p) => p.entrada !== null && p.saida !== null)
  const custoHora = t.custo !== null && t.economiaMin > 0 ? t.custo / (t.economiaMin / 60) : null

  const grupos: GrupoMinutos[] = MODULOS_IA.map((m) => ({
    titulo: m.titulo,
    operacoes: PROCESSOS_IA.filter((p) => p.modulo === m.slug && p.minutos > 0).map((p) => ({
      chave: p.chave,
      titulo: p.titulo,
      semIA: p.semIA,
      estimativa: p.minutos,
      ajuste: ajustes[p.chave] ?? null,
    })),
  })).filter((g) => g.operacoes.length > 0)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/gestao/ia">
            <ArrowLeft />
            Inteligência Artificial
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Boxes className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Inventário da IA</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Cada operação que o sistema faz com IA, por módulo: quantas vezes rodou, quanto custa em média e quanto tempo de trabalho poupou em relação a uma
          pessoa fazendo à mão.
        </p>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>O inventário ainda está sendo instalado no banco de dados.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">Resumo</CardTitle>
              <CardDescription className="text-xs">
                {periodo === "tudo" ? "Desde que o uso da IA passou a ser registrado." : "No período escolhido."} O tempo poupado conta só as operações que
                deram certo.
              </CardDescription>
            </div>
            <nav className="flex flex-wrap gap-1" aria-label="Período">
              {PERIODOS_INVENTARIO.map((p) => (
                <Button key={p.valor} size="sm" variant={p.valor === periodo ? "default" : "outline"} asChild>
                  <Link href={p.valor === "tudo" ? ROTA : `${ROTA}?periodo=${p.valor}`}>{p.rotulo}</Link>
                </Button>
              ))}
            </nav>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador
              rotulo="Tempo de trabalho poupado"
              valor={formatarTempo(t.economiaMin)}
              detalhe={`${inteiro.format(t.sucessos)} ${t.sucessos === 1 ? "operação feita" : "operações feitas"} pela IA`}
            />
            <Indicador
              rotulo="Operações com IA"
              valor={`${t.emUso} de ${inteiro.format(PROCESSOS_IA.length)}`}
              detalhe="em uso no período, das que o sistema oferece"
            />
            <Indicador
              rotulo="Custo estimado"
              valor={temPrecos ? usd(t.custo ?? 0) : "—"}
              detalhe={
                !temPrecos
                  ? "Sem preços cadastrados na Configuração da IA"
                  : [reais(t.custo ?? 0, cot), t.semPreco ? `${inteiro.format(t.semPreco)} chamadas sem preço ficaram de fora` : null].filter(Boolean).join(" · ") || null
              }
            />
            <Indicador
              rotulo="Custo por hora poupada"
              valor={custoHora === null ? "—" : usd(custoHora)}
              detalhe={custoHora === null ? (temPrecos ? "Ainda sem tempo poupado" : "Precisa dos preços") : reais(custoHora, cot)}
            />
          </div>
          {!temPrecos && (
            <Alert>
              <AlertDescription className="text-xs">
                O custo de cada operação vem dos preços que a Gestão informa em{" "}
                <Link href="/painel/gestao/ia" className="underline">
                  Inteligência Artificial › Configuração
                </Link>{" "}
                (US$ por milhão de tokens). Sem eles, o inventário mostra o uso e o tempo poupado, mas não o custo.
              </AlertDescription>
            </Alert>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" asChild>
              <a href={`${ROTA}/exportar?periodo=${periodo}`}>
                <FileSpreadsheet />
                Baixar planilha
              </a>
            </Button>
            <p className="text-muted-foreground text-xs">
              Tempo humano: estimativa de quanto uma pessoa levaria na operação típica — ajuste ao jeito da entidade em &quot;Tempo de uma pessoa por
              operação&quot;, no fim da página.
            </p>
          </div>
        </CardContent>
      </Card>

      {inventario.modulos.map((m) => (
        <Card key={m.slug}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">{m.titulo}</CardTitle>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">
                  {m.operacoes.length} {m.operacoes.length === 1 ? "operação" : "operações"}
                </Badge>
                {m.economiaMin > 0 && <Badge variant="success">{formatarTempo(m.economiaMin)} poupados</Badge>}
                {m.custo !== null && <Badge variant="outline">{usd(m.custo)}</Badge>}
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operação</TableHead>
                  <TableHead className="text-right">Feitas</TableHead>
                  <TableHead className="text-right">Custo médio</TableHead>
                  <TableHead className="text-right">Pessoa levaria</TableHead>
                  <TableHead className="text-right">Tempo poupado</TableHead>
                  <TableHead className="text-right">Custo por hora poupada</TableHead>
                  <TableHead>Último uso</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {m.operacoes.map((o) => (
                  <TableRow key={o.chave} className={o.chamadas === 0 ? "text-muted-foreground" : undefined}>
                    <TableCell className="min-w-64 align-top">
                      <p className="text-sm">{o.titulo}</p>
                      <p className="text-muted-foreground text-xs">
                        Sem a IA: {o.semIA.charAt(0).toLowerCase() + o.semIA.slice(1)}.
                        {o.modelos.length ? ` Modelo: ${o.modelos.join(", ")}.` : ""}
                        {o.duracaoMediaS !== null ? ` A IA responde em ~${o.duracaoMediaS.toLocaleString("pt-BR")} s.` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="text-right align-top tabular-nums">
                      {inteiro.format(o.sucessos)}
                      {o.falhas + o.bloqueadas > 0 && (
                        <p className="text-muted-foreground text-xs">
                          {o.falhas ? `${o.falhas} ${o.falhas === 1 ? "falha" : "falhas"}` : ""}
                          {o.falhas && o.bloqueadas ? " · " : ""}
                          {o.bloqueadas ? `${o.bloqueadas} barrada${o.bloqueadas === 1 ? "" : "s"}` : ""}
                        </p>
                      )}
                    </TableCell>
                    <TableCell className="text-right align-top tabular-nums">
                      {usdMedio(o.custoMedio)}
                      {o.custoMedio !== null && cot ? <p className="text-muted-foreground text-xs">{reais(o.custoMedio, cot, 4)}</p> : null}
                      {o.custoMedio === null && o.tokensMedios !== null ? (
                        <p className="text-muted-foreground text-xs">{inteiro.format(o.tokensMedios)} tokens, sem preço</p>
                      ) : null}
                      {o.custoMedio !== null && o.semPreco > 0 ? (
                        <p className="text-muted-foreground text-xs">{o.semPreco} sem preço fora da média</p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right align-top tabular-nums">
                      {o.minutos ? `${o.minutos.toLocaleString("pt-BR")} min` : "—"}
                      {o.minutosAjustados && <p className="text-muted-foreground text-xs">ajustado</p>}
                    </TableCell>
                    <TableCell className="text-right align-top font-medium tabular-nums">{o.economiaMin ? formatarTempo(o.economiaMin) : "—"}</TableCell>
                    <TableCell className="text-right align-top tabular-nums">{o.custoPorHora === null ? "—" : usd(o.custoPorHora)}</TableCell>
                    <TableCell className="align-top text-xs whitespace-nowrap">{o.ultima ? formatarData(o.ultima) : "nunca"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      <Card id="tempo-humano">
        <CardHeader>
          <CardTitle className="text-base">Tempo de uma pessoa por operação</CardTitle>
          <CardDescription className="text-xs">
            Quanto uma pessoa da entidade levaria para fazer cada operação típica à mão. O sistema traz uma estimativa; ajuste ao jeito de trabalhar da
            entidade. Em branco, vale a estimativa (o número cinza). O tempo poupado é recalculado com o ajuste, inclusive para trás.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MinutosForm grupos={grupos} />
        </CardContent>
      </Card>
    </>
  )
}
