import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileText, Landmark, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { rotuloCentroCusto } from "@/lib/centros-custo-rotulo"
import { hojeSP } from "@/lib/db/comum"
import { listarDepartamentos, listarFornecedores } from "@/lib/db/compras"
import { listarCentrosCusto } from "@/lib/db/financeiro"
import { urlArquivoOrdem } from "@/lib/db/ordens-extrato"
import { garantirGuiasPrevistas, obterTributo } from "@/lib/db/tributos"
import { retencoesDoTributo, type TipoRetencao } from "@/lib/db/rpa-retencoes"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { ROTULO_SITUACAO_GUIA, rotuloEsfera, rotuloPeriodicidade } from "@/lib/tributos-constantes"

import { SituacaoBadge } from "../../situacao-badge"
import { cancelarGuiaAction } from "../actions"
import { LancarGuiaDialog, TributoDialog } from "../tributo-forms"

export const metadata: Metadata = { title: "Tributo — Confluir" }

const ROTULO_RETENCAO: Record<TipoRetencao, string> = {
  inss_retido: "INSS retido (prestador)",
  inss_patronal: "INSS patronal (entidade)",
  irrf: "IRRF retido",
  iss: "ISS retido",
}

export default async function TributoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ novo?: string; lancada?: string }>
}) {
  const sessao = await requirePermissao("financeiro_tributos", ["financeiro_leitura"])
  const podeEditar = podeAcessar(sessao.permissoes, "financeiro_tributos")
  const { id } = await params
  const avisos = await searchParams
  await garantirGuiasPrevistas(id).catch(() => 0)
  const det = await obterTributo(id)
  if (!det) notFound()
  const { tributo: t, guias } = det
  const [orgaos, centros, departamentos] = await Promise.all([
    podeEditar ? listarFornecedores() : Promise.resolve([]),
    listarCentrosCusto(),
    podeEditar ? listarDepartamentos() : Promise.resolve([]),
  ])
  const centro = centros.find((c) => c.id === t.centroCustoId)
  const retencoes = t.retencaoRpa ? await retencoesDoTributo(t.id) : []
  // Por competência (mais recente primeiro), com o total de cada uma.
  const porCompetencia = [...new Set(retencoes.map((r) => r.competencia))].map((c) => ({
    competencia: c,
    linhas: retencoes.filter((r) => r.competencia === c),
    total: Math.round(retencoes.filter((r) => r.competencia === c).reduce((a, r) => a + r.valor, 0) * 100) / 100,
  }))
  const hoje = hojeSP()
  const ano = hoje.slice(0, 4)
  const pagoNoAno = guias
    .filter((g) => g.situacao === "lancado" && g.ordemSituacao === "Paga" && (g.dataPagamento ?? "").startsWith(ano))
    .reduce((a, g) => a + (g.valorPago ?? g.valor ?? 0), 0)
  // Previstas primeiro (a mais próxima no topo), depois o histórico.
  const ordenadas = [
    ...guias.filter((g) => g.situacao === "aguardando_guia").sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? "")),
    ...guias.filter((g) => g.situacao !== "aguardando_guia"),
  ]
  const urls = new Map(
    await Promise.all(ordenadas.filter((g) => g.arquivoGuia).slice(0, 30).map(async (g) => [g.id, await urlArquivoOrdem(g.arquivoGuia)] as const))
  )

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/financeiro/tributos">
            <ArrowLeft />
            Tributos
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{t.abreviacao ?? t.nome}</h1>
          <Landmark className="text-muted-foreground size-5" />
          {!t.ativo && <Badge variant="secondary">Desativado</Badge>}
          {podeEditar && (
            <div className="ml-auto flex flex-wrap gap-2">
              <LancarGuiaDialog tributoId={t.id} valorEsperado={t.retencaoRpa ? null : t.valorEsperado} />
              <TributoDialog
                tributo={{ ...t }}
                orgaos={orgaos}
                centros={centros.filter((c) => c.usavel !== false).map((c) => ({ id: c.id, rotulo: rotuloCentroCusto(c) }))}
                departamentos={departamentos.map((d) => ({ id: d.id, rotulo: d.nome }))}
              />
            </div>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">{t.nome !== t.abreviacao ? t.nome : ""}</p>
      </div>

      {avisos.novo === "1" && (
        <Alert variant="success">
          <AlertDescription>
            Tributo cadastrado.{t.periodicidade === "mensal" ? " As próximas guias já aparecem como previstas." : ""}
          </AlertDescription>
        </Alert>
      )}
      {avisos.lancada && (
        <Alert variant="success">
          <AlertDescription>
            Guia lançada e ordem de pagamento gerada —{" "}
            {avisos.lancada === "apagar"
              ? "no valor esperado: já está \"A pagar\" (autorização dispensada)."
              : "segue para a autorização por alçada."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Órgão</CardDescription>
            <CardTitle className="text-base">{t.beneficiario ?? "—"}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">{rotuloEsfera(t.esfera)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Calendário</CardDescription>
            <CardTitle className="text-base">{rotuloPeriodicidade(t.periodicidade)}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            {t.diaVencimento ? `Vence todo dia ${t.diaVencimento}` : "Sem dia fixo"} · forma {t.formaPagamento ?? "Boleto"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Valor esperado</CardDescription>
            <CardTitle className="text-base">
              {t.retencaoRpa ? "Soma das retenções" : t.valorEsperado != null ? formatarMoeda(t.valorEsperado) : "Variável"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">
            {t.retencaoRpa
              ? "Dos RPAs pagos na competência — guia nesse valor dispensa a autorização"
              : t.valorEsperado != null
                ? "Guia nesse valor dispensa a autorização"
                : "Toda guia passa pela alçada"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pago em {ano}</CardDescription>
            <CardTitle className="text-base tabular-nums">{formatarMoeda(pagoNoAno)}</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-xs">{centro ? rotuloCentroCusto(centro) : "Sem centro de custo"}</CardContent>
        </Card>
      </div>

      {t.observacoes && <p className="text-muted-foreground text-sm whitespace-pre-line">{t.observacoes}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Guias</CardTitle>
          <CardDescription>
            Uma por competência. A prevista espera a guia; lançada, ela gera a ordem de pagamento.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Competência</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {ordenadas.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="h-20">
                    <p className="text-muted-foreground text-center text-sm">Nenhuma guia ainda.</p>
                  </TableCell>
                </TableRow>
              )}
              {ordenadas.map((g) => {
                const vencida = g.situacao === "aguardando_guia" && g.vencimento !== null && g.vencimento < hoje
                return (
                  <TableRow key={g.id} className={g.situacao === "cancelado" ? "opacity-60" : ""}>
                    <TableCell className="font-medium">{g.competencia}</TableCell>
                    <TableCell className={vencida ? "text-destructive font-medium" : ""}>
                      {g.vencimento ? formatarData(g.vencimento) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{g.valor != null ? formatarMoeda(g.valor) : "—"}</TableCell>
                    <TableCell>
                      {g.ordemId ? (
                        <Link href={`/painel/financeiro/ordens/${g.ordemId}`} className="inline-flex flex-col gap-1 hover:underline">
                          <span className="text-xs">{g.ordemCodigo}</span>
                          <SituacaoBadge situacao={g.ordemSituacao} />
                        </Link>
                      ) : (
                        <Badge variant={g.situacao === "aguardando_guia" ? "outline" : "secondary"}>
                          {ROTULO_SITUACAO_GUIA[g.situacao]}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {urls.get(g.id) && (
                          <a href={urls.get(g.id)!} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-1 text-xs hover:underline">
                            <FileText className="size-3.5" />
                            Guia
                          </a>
                        )}
                        {podeEditar && g.situacao === "aguardando_guia" && (
                          <>
                            <LancarGuiaDialog
                              tributoId={t.id}
                              valorEsperado={t.valorEsperado}
                              guia={{
                                id: g.id,
                                competenciaMes: (g.competenciaInicio ?? "").slice(0, 7),
                                vencimento: g.vencimento,
                                valor: g.valor,
                                rotulo: g.competencia,
                              }}
                            />
                            <form action={cancelarGuiaAction}>
                              <input type="hidden" name="guia_id" value={g.id} />
                              <input type="hidden" name="tributo_id" value={t.id} />
                              <Button type="submit" size="sm" variant="ghost" title="Cancelar a guia prevista (não se aplica)">
                                <X />
                              </Button>
                            </form>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {t.retencaoRpa && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Retenções de RPA</CardTitle>
            <CardDescription>
              Entram quando a ordem do RPA é paga, na competência do pagamento
              {t.retencaoRpa === "inss" ? " — o INSS retido do prestador e a cota patronal da entidade sobre o bruto" : ""}.
              A guia prevista da competência já nasce com a soma; guia lançada em outro valor vai para a alçada.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {porCompetencia.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum RPA pago ainda.</p>
            ) : (
              porCompetencia.map((c) => (
                <div key={c.competencia} className="grid gap-1">
                  <p className="text-sm font-medium">
                    {c.competencia.slice(5, 7)}/{c.competencia.slice(0, 4)} ·{" "}
                    <span className="tabular-nums">{formatarMoeda(c.total)}</span>
                  </p>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>RPA</TableHead>
                        <TableHead>Prestador</TableHead>
                        <TableHead>Retenção</TableHead>
                        <TableHead className="text-right">Base (bruto)</TableHead>
                        <TableHead className="text-right">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {c.linhas.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>
                            <Link href={`/painel/compras/rpa/${r.rpaId}`} className="text-primary hover:underline">
                              nº {r.rpaNumero ?? "—"}
                            </Link>
                          </TableCell>
                          <TableCell className="max-w-64">{r.prestador ?? "—"}</TableCell>
                          <TableCell>
                            {ROTULO_RETENCAO[r.tipo]}
                            {r.aliquota != null ? ` (${String(r.aliquota).replace(".", ",")}%)` : ""}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{r.base != null ? formatarMoeda(r.base) : "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatarMoeda(r.valor)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
