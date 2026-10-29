import Link from "next/link"

import { GraficoColunas } from "@/components/graficos/colunas"
import { rotuloMes } from "@/components/graficos/base"
import { KpiHud } from "@/components/painel/hud"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { churn } from "@/lib/db/churn"
import { formatarDataHora } from "@/lib/formato"

import { MotivoEmLote } from "@/app/painel/indicadores/churn/motivo-em-lote"
import { vinculosSemMotivo } from "@/lib/db/filiacao-motivos"

const pct = (v: number | null, d = 1) => (v === null ? "—" : `${v.toLocaleString("pt-BR", { maximumFractionDigits: d })}%`)
const anos = (v: number | null) => (v === null ? "—" : v < 1 ? `${Math.round(v * 12)} meses` : `${v.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} anos`)

/** Churn e retenção: quem sai, de onde, depois de quanto tempo e por quê (onda 4, I6). Antes /painel/indicadores/churn. */
export async function IndicadoresChurn() {
  const c = await churn()
  // O motivo é do vínculo da última saída; quem saiu sem vínculo encerrado não tem onde recebê-lo.
  const comVinculo = c.semMotivo.filter((p) => p.vinculoId)
  const semVinculo = c.semMotivo.filter((p) => !p.vinculoId)
  const paraLote = c.motivoDisponivel
    ? await vinculosSemMotivo({ vinculoIds: comVinculo.map((p) => p.vinculoId as string) })
    : []

  return (
    <div className="grid gap-4">
      <p className="text-muted-foreground mt-1 text-xs">
        Saídas e entradas nos últimos 12 meses, taxa mensal por fonte pagadora, tempo de filiação de quem saiu e os motivos. Apurado em {formatarDataHora(c.geradoEm)}; fica guardado por 10 minutos.
      </p>

      {!c.motivoDisponivel && (
        <Alert>
          <AlertDescription>Falta rodar o SQL supabase/filiacao-motivo-desfiliacao.sql para registrar os motivos de desfiliação.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiHud rotulo="Saídas em 12 meses" valor={c.saidas12m.toLocaleString("pt-BR")} nota={`${c.entradas12m.toLocaleString("pt-BR")} entradas no período`} />
        <KpiHud rotulo="Taxa mensal média" valor={pct(c.taxaMediaMensal, 2)} nota="saídas ÷ ativos no início do mês" subirEhBom={false} />
        <KpiHud rotulo="Tempo médio de filiação" valor={anos(c.tempoMedioAnos)} nota={`mediana ${anos(c.tempoMedianoAnos)}`} />
        <KpiHud rotulo="Com motivo informado" valor={pct(c.comMotivoPct, 0)} nota={c.semMotivo.length ? `${c.semMotivo.length} sem motivo abaixo` : "todos informados"} />
        <KpiHud rotulo="Saldo em 12 meses" valor={(c.entradas12m - c.saidas12m).toLocaleString("pt-BR", { signDisplay: "always" })} nota="entradas − saídas" />
      </div>

      <Card className="hud-cartao">
        <CardHeader>
          <CardTitle className="text-base">Entradas e saídas por mês</CardTitle>
        </CardHeader>
        <CardContent>
          <GraficoColunas
            altura={170}
            titulo="Entradas e saídas por mês"
            categorias={c.meses.map((m) => rotuloMes(`${m.mes}-01`))}
            series={[
              { nome: "Entradas", valores: c.meses.map((m) => m.entradas) },
              { nome: "Saídas", valores: c.meses.map((m) => m.saidas) },
            ]}
          />
          <details className="mt-3 text-xs">
            <summary className="text-muted-foreground cursor-pointer">Taxa mensal (saídas ÷ ativos no início do mês)</summary>
            <ul className="mt-2 grid gap-1 sm:grid-cols-3 lg:grid-cols-4">
              {c.meses.map((m) => (
                <li key={m.mes} className="flex justify-between tabular-nums">
                  <span>{rotuloMes(`${m.mes}-01`)}</span>
                  <span>
                    {m.saidas}/{m.ativosInicio} · {pct(m.taxa, 2)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="hud-cartao">
          <CardHeader>
            <CardTitle className="text-base">Por fonte pagadora</CardTitle>
            <CardDescription className="text-xs">Vínculos encerrados nos 12 meses e a taxa anual (saídas ÷ ativos de 12 meses atrás).</CardDescription>
          </CardHeader>
          <CardContent>
            {c.fontes.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sem vínculos com fonte pagadora.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fonte</TableHead>
                    <TableHead className="text-right">Ativos</TableHead>
                    <TableHead className="text-right">Entradas</TableHead>
                    <TableHead className="text-right">Saídas</TableHead>
                    <TableHead className="text-right">Taxa anual</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.fontes.map((f) => (
                    <TableRow key={f.fonteId}>
                      <TableCell>
                        <Link href={`/painel/filiados/lista?fonte=${f.fonteId}&condicao=Ativo&situacao=todas`} className="underline-offset-4 hover:underline">
                          {f.fonte}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{f.ativos.toLocaleString("pt-BR")}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.entradas12m}</TableCell>
                      <TableCell className="text-right tabular-nums">{f.saidas12m}</TableCell>
                      <TableCell className={`text-right tabular-nums ${f.taxaAnual !== null && f.taxaAnual >= 15 ? "text-destructive font-medium" : ""}`}>{pct(f.taxaAnual)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="hud-cartao">
          <CardHeader>
            <CardTitle className="text-base">Motivos de desfiliação</CardTitle>
            <CardDescription className="text-xs">De quem saiu nos últimos 12 meses.</CardDescription>
          </CardHeader>
          <CardContent>
            {c.motivos.length === 0 ? (
              <p className="text-muted-foreground text-sm">Ninguém saiu no período.</p>
            ) : (
              <ul className="grid gap-2">
                {c.motivos.map((m) => {
                  const largura = c.saidas12m ? Math.round((m.quantidade / c.saidas12m) * 100) : 0
                  return (
                    <li key={m.chave ?? "nulo"} className="text-sm">
                      <div className="flex items-center justify-between gap-3">
                        <span className={m.chave ? "" : "text-muted-foreground"}>{m.rotulo}</span>
                        <span className="tabular-nums">
                          {m.quantidade} · {largura}%
                        </span>
                      </div>
                      <div className="bg-muted mt-1 h-1.5 overflow-hidden rounded-full">
                        <div className={`h-full rounded-full ${m.chave ? "bg-primary" : "bg-muted-foreground/40"}`} style={{ width: `${largura}%` }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {c.semMotivo.length > 0 && (
        <Card className="hud-cartao">
          <CardHeader>
            <CardTitle className="text-base">Saíram sem motivo registrado</CardTitle>
            <CardDescription className="text-xs">
              {c.semMotivo.length} saída(s) nos últimos 12 meses. Marque e registre o motivo de vários de uma vez (vale para o vínculo da última saída) — sem motivo, o churn não explica nada.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <MotivoEmLote itens={paraLote} />
            {semVinculo.length > 0 && (
              <p className="text-muted-foreground text-xs">
                {semVinculo.length} pessoa(s) saíram sem vínculo encerrado no histórico — registre a desfiliação no vínculo, pela
                ficha:{" "}
                {semVinculo.slice(0, 20).map((p, i) => (
                  <span key={p.id}>
                    {i > 0 ? ", " : ""}
                    <Link href={`/painel/filiados/${p.id}`} className="underline-offset-4 hover:underline">
                      {p.nome ?? "(sem nome)"}
                    </Link>
                  </span>
                ))}
                {semVinculo.length > 20 ? ` e mais ${semVinculo.length - 20}` : ""}.
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
