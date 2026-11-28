import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Download, FileText } from "lucide-react"

import { TileIndicador } from "@/components/graficos/tile"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { relatorioGeralPonto } from "@/lib/db/ponto-relatorio-geral"
import { formatarMoeda } from "@/lib/formato"
import { hhmm } from "@/lib/horas"
import { motivoAcerto } from "@/lib/ponto-acertos"
import { custoMedioHora, rotuloMesCurto, ROTULO_DIVERGENCIA, type TipoDivergencia } from "@/lib/ponto-relatorio-geral"

export const metadata: Metadata = { title: "Relatório do ponto e das horas extras — Confluir" }

const SELECT =
  "border-input bg-background text-foreground h-9 rounded-md border px-2 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const h = (v: number) => hhmm(v)
const r$ = (v: number) => formatarMoeda(v)

/**
 * Relatório consolidado do ponto e das horas extras (Ponto, Fase 3 —
 * 28/11/2026): período, departamento ou pessoa; horas realizadas e pagas, o
 * valor pago, o banco, os acertos e as divergências. Mesmo conteúdo no PDF e
 * na planilha.
 */
export default async function RelatorioPontoPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requirePermissao("pessoal_gestao")
  const sp = await searchParams
  const { relatorio, opcoes, faixas } = await relatorioGeralPonto(sp)
  const { filtro, totais, meses, pessoas, divergencias, usaValor } = relatorio
  const q = new URLSearchParams({ de: filtro.de, ate: filtro.ate })
  if (filtro.departamento) q.set("departamento", filtro.departamento)
  if (filtro.funcionario) q.set("funcionario", filtro.funcionario)
  const f1 = faixas["70"]
  const f2 = faixas["100"]
  const graves = divergencias.filter((d) => ROTULO_DIVERGENCIA[d.tipo].grave)
  const porTipo = new Map<TipoDivergencia, typeof divergencias>()
  for (const d of divergencias) (porTipo.get(d.tipo) ?? porTipo.set(d.tipo, []).get(d.tipo)!).push(d)
  const custo1 = custoMedioHora(totais, "f1")
  const custo2 = custoMedioHora(totais, "f2")

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/ponto">
            <ArrowLeft />
            Controle de ponto
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Relatório do ponto e das horas extras</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {rotuloMesCurto(filtro.de)} a {rotuloMesCurto(filtro.ate)} · {totais.pessoas} pessoa(s) · {totais.registros} registro(s)
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href={`/painel/pessoal/ponto/relatorio/pdf?${q}`} target="_blank" rel="noopener">
                <FileText />
                PDF
              </a>
            </Button>
            <Button variant="outline" asChild>
              <a href={`/painel/pessoal/ponto/relatorio/csv?${q}`}>
                <Download />
                Planilha
              </a>
            </Button>
          </div>
        </div>
      </div>

      <form className="flex flex-wrap items-end gap-2 text-sm">
        <label className="grid gap-1">
          <span className="text-muted-foreground text-xs">De</span>
          <input type="month" name="de" defaultValue={filtro.de} className={SELECT} />
        </label>
        <label className="grid gap-1">
          <span className="text-muted-foreground text-xs">Até</span>
          <input type="month" name="ate" defaultValue={filtro.ate} className={SELECT} />
        </label>
        <label className="grid gap-1">
          <span className="text-muted-foreground text-xs">Departamento</span>
          <select name="departamento" defaultValue={filtro.departamento ?? ""} className={SELECT}>
            <option value="">Todos</option>
            {opcoes.departamentos.map((d) => (
              <option key={d.chave} value={d.chave}>
                {d.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1">
          <span className="text-muted-foreground text-xs">Funcionário</span>
          <select name="funcionario" defaultValue={filtro.funcionario ?? ""} className={SELECT}>
            <option value="">Todos</option>
            {opcoes.funcionarios.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline">
          Ver
        </Button>
      </form>

      {graves.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            {graves.length} divergência(s) no saldo do banco de horas — conta que não fecha, cadeia quebrada entre remessas
            ou hora paga sem saldo. Veja em <a href="#divergencias" className="underline underline-offset-4">Divergências</a>,
            no fim da página.
          </AlertDescription>
        </Alert>
      )}
      {totais.registros === 0 && (
        <Alert>
          <AlertDescription>Nenhum registro de ponto no período e no filtro escolhidos.</AlertDescription>
        </Alert>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <TileIndicador rotulo="Horas extras realizadas" valor={h(totais.realizadas.f1 + totais.realizadas.f2)} nota={`${h(totais.realizadas.f1)} a ${f1} · ${h(totais.realizadas.f2)} a ${f2}`} />
        <TileIndicador rotulo="Horas pagas" valor={h(totais.pagas.f1 + totais.pagas.f2)} nota={`${h(totais.pagas.f1)} a ${f1} · ${h(totais.pagas.f2)} a ${f2}`} />
        <TileIndicador
          rotulo="Valor pago"
          valor={usaValor ? r$(totais.valor.f1 + totais.valor.f2) : "—"}
          nota={
            usaValor
              ? [custo1 !== null && `${r$(custo1)}/h a ${f1}`, custo2 !== null && `${r$(custo2)}/h a ${f2}`].filter(Boolean).join(" · ") || "sem horas com valor"
              : "lido do contracheque (Horas pagas pelo contracheque, na remessa)"
          }
        />
        <TileIndicador rotulo="Banco no fim do período" valor={h(totais.saldoFinal.f1 + totais.saldoFinal.f2)} nota={`${h(totais.saldoFinal.f1)} a ${f1} · ${h(totais.saldoFinal.f2)} a ${f2}`} />
        <TileIndicador
          rotulo="Zerado em acertos"
          valor={h(totais.acertos.positivo)}
          nota={
            totais.acertos.pessoas
              ? `${totais.acertos.pessoas} pessoa(s) · ${h(totais.acertos.pagoEmFolha)} pagas em folha · ${h(totais.acertos.negativo)} negativas (${h(totais.acertos.descontado)} descontadas)`
              : "nenhum acerto no período"
          }
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mês a mês</CardTitle>
          <CardDescription>Horas de cada remessa; o banco é a soma dos saldos remanescentes do mês; zerado: horas a favor · negativas, nos acertos do mês.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Mês</TableHead>
                  <TableHead className="text-right">Realizadas {f1}</TableHead>
                  <TableHead className="text-right">Realizadas {f2}</TableHead>
                  <TableHead className="text-right">Pagas {f1}</TableHead>
                  <TableHead className="text-right">Pagas {f2}</TableHead>
                  {usaValor && <TableHead className="text-right">Valor pago</TableHead>}
                  <TableHead className="text-right">Banco</TableHead>
                  <TableHead className="text-right">Zerado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {meses.map((m) => (
                  <TableRow key={m.competencia}>
                    <TableCell>{rotuloMesCurto(m.competencia)}</TableCell>
                    <TableCell className="text-right">{h(m.realizadas.f1)}</TableCell>
                    <TableCell className="text-right">{h(m.realizadas.f2)}</TableCell>
                    <TableCell className="text-right">{h(m.pagas.f1)}</TableCell>
                    <TableCell className="text-right">{h(m.pagas.f2)}</TableCell>
                    {usaValor && <TableCell className="text-right">{m.valor.f1 + m.valor.f2 ? r$(m.valor.f1 + m.valor.f2) : "—"}</TableCell>}
                    <TableCell className="text-right">{h(m.saldo.f1 + m.saldo.f2)}</TableCell>
                    <TableCell className="text-right">{m.zerado.positivo || m.zerado.negativo ? `${h(m.zerado.positivo)}${m.zerado.negativo ? ` · -${h(m.zerado.negativo)}` : ""}` : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por funcionário</CardTitle>
          <CardDescription>
            Totais do período e o banco no fim dele (depois dos acertos). O relatório de cada pessoa, com os anos lado a
            lado, está no nome.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Funcionário</TableHead>
                  <TableHead className="text-right">Realizadas</TableHead>
                  <TableHead className="text-right">Pagas</TableHead>
                  {usaValor && <TableHead className="text-right">Valor pago</TableHead>}
                  {usaValor && <TableHead className="text-right">R$/hora</TableHead>}
                  <TableHead className="text-right">Banco no fim</TableHead>
                  <TableHead>Acertos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pessoas.map((p) => (
                  <TableRow key={p.funcionarioId}>
                    <TableCell>
                      <Link href={`/painel/pessoal/ponto/funcionario/${p.funcionarioId}`} className="font-medium hover:underline">
                        {p.nome}
                      </Link>
                      <div className="text-muted-foreground text-xs">
                        {p.departamento} · {p.meses} mês(es)
                        {p.divergencias > 0 && (
                          <Badge variant="warning" className="ml-1">
                            {p.divergencias} divergência(s)
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-sm whitespace-nowrap">
                      {h(p.realizadas.f1)} · {h(p.realizadas.f2)}
                    </TableCell>
                    <TableCell className="text-right text-sm whitespace-nowrap">
                      {h(p.pagas.f1)} · {h(p.pagas.f2)}
                    </TableCell>
                    {usaValor && <TableCell className="text-right text-sm">{p.valor.f1 + p.valor.f2 ? r$(p.valor.f1 + p.valor.f2) : "—"}</TableCell>}
                    {usaValor && (
                      <TableCell className="text-right text-sm whitespace-nowrap">
                        {p.valorHora.f1 !== null ? r$(p.valorHora.f1) : "—"} · {p.valorHora.f2 !== null ? r$(p.valorHora.f2) : "—"}
                      </TableCell>
                    )}
                    <TableCell className="text-right text-sm whitespace-nowrap">
                      {h(p.saldoFinal.f1)} · {h(p.saldoFinal.f2)}
                    </TableCell>
                    <TableCell className="text-xs">
                      {p.acertos.length
                        ? p.acertos.map((a) => `${rotuloMesCurto(a.competencia)} (${motivoAcerto(a.motivo)?.rotulo.toLowerCase() ?? a.motivo})`).join(", ")
                        : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            Em cada coluna de horas: {f1} · {f2}.
          </p>
        </CardContent>
      </Card>

      <section id="divergencias" className="grid gap-2">
        <h2 className="text-base font-semibold">Divergências</h2>
        {divergencias.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nenhuma: as contas do banco fecham e a cadeia entre as remessas está íntegra.</p>
        ) : (
          [...porTipo].map(([tipo, lista]) => (
            <GrupoColapsavel
              key={tipo}
              titulo={`${ROTULO_DIVERGENCIA[tipo].rotulo} (${lista.length})`}
              descricao={ROTULO_DIVERGENCIA[tipo].explicacao}
              aberto={ROTULO_DIVERGENCIA[tipo].grave}
            >
              <ul className="grid gap-1 text-sm">
                {lista.map((d, i) => (
                  <li key={i}>
                    <Link href={`/painel/pessoal/ponto/${d.remessaId}`} className="font-medium hover:underline">
                      {d.nome} · {rotuloMesCurto(d.competencia)}
                    </Link>
                    <span className="text-muted-foreground"> — {d.texto}</span>
                  </li>
                ))}
              </ul>
            </GrupoColapsavel>
          ))
        )}
      </section>
    </>
  )
}
