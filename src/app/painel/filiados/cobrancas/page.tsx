import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, QrCode } from "lucide-react"

import { TileIndicador } from "@/components/graficos/tile"
import { moeda } from "@/components/graficos/base"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { competenciaAtual, indicadoresCobranca, listarCobrancas, obterConfigCobranca, recebedorPix, rotuloCompetencia } from "@/lib/db/cobrancas"
import { hojeSP } from "@/lib/db/comum"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { BaixaCobrancaBotoes, ConfigCobrancaForm, GerarCobrancasForm } from "./forms"

export const metadata: Metadata = { title: "Cobranças da contribuição — Confluir" }

const SITUACOES = [
  { valor: "aberta", rotulo: "Abertas" },
  { valor: "vencidas", rotulo: "Vencidas" },
  { valor: "paga", rotulo: "Pagas" },
  { valor: "cancelada", rotulo: "Canceladas" },
  { valor: "todas", rotulo: "Todas" },
] as const

/** Contribuição de quem paga por Pix: configuração, geração por competência e baixa (onda 5, A3). */
export default async function CobrancasPage({ searchParams }: { searchParams: Promise<{ competencia?: string; situacao?: string }> }) {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])
  const sp = await searchParams
  const situacao = SITUACOES.find((s) => s.valor === sp.situacao)?.valor ?? "aberta"
  const [config, recebedor, ind, lista] = await Promise.all([
    obterConfigCobranca(),
    recebedorPix(),
    indicadoresCobranca().catch(() => ({ abertas: 0, vencidas: 0, valorAberto: 0, pagas30d: 0, valorPago30d: 0 })),
    listarCobrancas({ competencia: sp.competencia, situacao }),
  ])
  const hoje = hojeSP()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/filiados">
            <ArrowLeft />
            Filiados
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <QrCode className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Cobranças da contribuição</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Para quem paga por Pix: uma cobrança por mês com QR Code e copia e cola no portal. A baixa vem do extrato (conciliação) ou daqui, e vira recebimento na remessa da competência.
        </p>
      </div>

      {!config.disponivel ? (
        <Alert>
          <AlertDescription>Falta rodar o SQL supabase/filiacao-cobrancas.sql.</AlertDescription>
        </Alert>
      ) : (
        <>
          {"erro" in recebedor && (
            <Alert>
              <AlertDescription>{recebedor.erro}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TileIndicador rotulo="Abertas" valor={String(ind.abertas)} nota={moeda(ind.valorAberto)} />
            <TileIndicador rotulo="Vencidas" valor={String(ind.vencidas)} nota="abertas após o vencimento" subirEhBom={false} />
            <TileIndicador rotulo="Pagas em 30 dias" valor={String(ind.pagas30d)} nota={moeda(ind.valorPago30d)} />
            <TileIndicador rotulo="Recebedor Pix" valor={"erro" in recebedor ? "—" : recebedor.chave.length > 14 ? `${recebedor.chave.slice(0, 12)}…` : recebedor.chave} nota={"erro" in recebedor ? "sem chave" : `${recebedor.nome} · ${recebedor.cidade}`} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Configuração</CardTitle>
                <CardDescription className="text-xs">Valor padrão, dia do vencimento e geração automática no dia 1.</CardDescription>
              </CardHeader>
              <CardContent>
                <ConfigCobrancaForm config={config} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Gerar competência</CardTitle>
                <CardDescription className="text-xs">Cria a cobrança de quem ainda não tem e avisa o filiado (sino e e-mail). Pode rodar mais de uma vez.</CardDescription>
              </CardHeader>
              <CardContent>
                <GerarCobrancasForm competencia={sp.competencia ?? competenciaAtual()} />
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {SITUACOES.map((s) => (
              <Button key={s.valor} variant={s.valor === situacao ? "default" : "outline"} size="sm" asChild>
                <Link href={`/painel/filiados/cobrancas?situacao=${s.valor}${sp.competencia ? `&competencia=${sp.competencia}` : ""}`}>{s.rotulo}</Link>
              </Button>
            ))}
            {lista.competencias.length > 0 && (
              <form className="ml-auto flex items-center gap-2 text-xs">
                <input type="hidden" name="situacao" value={situacao} />
                <select name="competencia" defaultValue={sp.competencia ?? ""} className="border-input bg-background h-8 rounded-md border px-2 text-xs">
                  <option value="">Todas as competências</option>
                  {lista.competencias.map((c) => (
                    <option key={c} value={c}>
                      {rotuloCompetencia(c)}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm" variant="outline">
                  Filtrar
                </Button>
              </form>
            )}
          </div>

          <Card>
            <CardContent>
              {lista.cobrancas.length === 0 ? (
                <p className="text-muted-foreground py-6 text-sm">Nenhuma cobrança com esses filtros.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Competência</TableHead>
                      <TableHead>Filiado</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead className="text-right">Valor</TableHead>
                      <TableHead>txid</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lista.cobrancas.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="tabular-nums">{rotuloCompetencia(c.competencia)}</TableCell>
                        <TableCell>
                          <Link href={`/painel/filiados/${c.filiacaoId}`} className="underline-offset-4 hover:underline">
                            {c.nome ?? c.cpf ?? "—"}
                          </Link>
                        </TableCell>
                        <TableCell className={c.vencida ? "text-destructive" : "text-muted-foreground"}>{formatarData(c.vencimento)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatarMoeda(c.valor)}
                          {c.valorPago !== null && Math.abs(c.valorPago - c.valor) >= 0.005 && <span className="text-muted-foreground block text-xs">pago {formatarMoeda(c.valorPago)}</span>}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{c.txid}</TableCell>
                        <TableCell>
                          <Badge variant={c.situacao === "paga" ? "success" : c.situacao === "cancelada" ? "outline" : c.vencida ? "destructive" : "secondary"}>
                            {c.situacao === "paga" ? `paga${c.pagoEm ? ` em ${formatarData(c.pagoEm)}` : ""}` : c.vencida ? "vencida" : c.situacao}
                          </Badge>
                        </TableCell>
                        <TableCell>{c.situacao === "aberta" && <BaixaCobrancaBotoes cobrancaId={c.id} valor={c.valor} hoje={hoje} />}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}
