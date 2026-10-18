import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ShieldCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { carregarRetencao, type Execucao } from "@/lib/db/lgpd-retencao"
import { formatarCnpjCpf, formatarData, formatarDataHora } from "@/lib/formato"
import { VALIDADE_SIMULACAO_DIAS } from "@/lib/lgpd/retencao-regras"

import { EncerrarBloqueioBotao, NovoBloqueioForm, RegraForm, SimularBotao } from "./forms"

export const metadata: Metadata = { title: "LGPD — Confluir" }

function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`
}

function ResumoExecucao({ e }: { e: Execucao }) {
  const porTabela = (e.detalhe.porTabela ?? {}) as Record<string, number>
  const tabelas = Object.entries(porTabela)
  return (
    <div className="grid gap-1 text-xs">
      <p>
        <strong>{plural(e.linhas, "registro", "registros")}</strong>
        {e.modo === "simulacao" ? " sairiam" : " saíram"}
        {e.arquivos > 0 && <> e {plural(e.arquivos, "arquivo", "arquivos")} do Storage</>}
        {e.bloqueadas > 0 && <>; {plural(e.bloqueadas, "poupado por bloqueio", "poupados por bloqueio")}</>}.
      </p>
      {tabelas.length > 1 && (
        <p className="text-muted-foreground">
          {tabelas.map(([t, n]) => `${t}: ${n.toLocaleString("pt-BR")}`).join(" · ")}
        </p>
      )}
      <p className="text-muted-foreground">
        {formatarDataHora(e.iniciadaEm)} · {e.origem === "cron" ? "cron mensal" : "pedida na tela"} · prazo de {e.prazoDias} dias (antes de {formatarData(e.corte)})
      </p>
      {typeof e.detalhe.limiteAtingido === "number" && (
        <p className="text-warning-fg">Passou do teto de {e.detalhe.limiteAtingido.toLocaleString("pt-BR")} por rodada; o resto sai na seguinte.</p>
      )}
      {e.erro && <p className="text-destructive">Erro: {e.erro}</p>}
    </div>
  )
}

/**
 * Institucional › LGPD: o motor de retenção (seção 4 de docs/lgpd/retencao.md)
 * e os bloqueios por litígio. A regra começa desligada: o cron mensal só
 * simula. A entidade liga a execução real depois de ver a simulação.
 */
export default async function LgpdPage() {
  await requirePermissao("configuracoes")
  const dados = await carregarRetencao()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional">
            <ArrowLeft />
            Institucional
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <ShieldCheck className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">LGPD: retenção e descarte</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Prazos de guarda dos dados pessoais. Todo mês, no dia 2, o sistema confere cada regra: desligada, só simula e mostra aqui o que sairia; ligada, apaga de fato. Pessoas com bloqueio por litígio ficam fora de todas as regras.
        </p>
      </div>

      {!dados.disponivel ? (
        <Alert>
          <AlertDescription>Falta aplicar a migração do motor de retenção (supabase/migrations/20261018191616_motor_retencao.sql). Detalhe: {dados.erro}</AlertDescription>
        </Alert>
      ) : (
        <>
          <div>
            <SimularBotao rotulo="Simular todas as regras agora" />
          </div>

          {dados.regras.map((r) => (
            <Card key={r.id}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className="text-base">
                    {r.definicao.codigo} · {r.definicao.titulo}
                  </CardTitle>
                  {r.ativa ? <Badge variant="warning">Execução real</Badge> : <Badge variant="secondary">Só simulação</Badge>}
                </div>
                <CardDescription className="text-xs">
                  {r.definicao.descricao} Fundamento: {r.definicao.fundamento}.{" "}
                  {r.definicao.prazoNoModulo ? (
                    <>
                      O prazo é o da{" "}
                      <Link href={r.definicao.prazoNoModulo.href} className="underline underline-offset-4">
                        {r.definicao.prazoNoModulo.rotulo}
                      </Link>
                      {r.ultimaSimulacao && <> (hoje, {r.ultimaSimulacao.prazoDias} dias)</>}.
                    </>
                  ) : (
                    <>
                      Prazo em vigor: {r.prazoEfetivoDias} dias (padrão {r.prazoPadraoDias}, mínimo {r.prazoMinimoDias}).
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="grid gap-2 rounded-lg border p-3">
                  <p className="text-sm font-medium">Última simulação</p>
                  {r.ultimaSimulacao ? <ResumoExecucao e={r.ultimaSimulacao} /> : <p className="text-muted-foreground text-xs">Ainda não simulada.</p>}
                  <SimularBotao codigo={r.definicao.codigo} rotulo={`Simular ${r.definicao.codigo}`} />
                </div>
                {r.ultimaReal && (
                  <div className="grid gap-2 rounded-lg border p-3">
                    <p className="text-sm font-medium">Última execução real</p>
                    <ResumoExecucao e={r.ultimaReal} />
                  </div>
                )}
                <RegraForm
                  key={`${r.ativa}-${r.prazoDias}`}
                  regraId={r.id}
                  codigo={r.definicao.codigo}
                  prazoDias={r.prazoDias}
                  prazoPadraoDias={r.prazoPadraoDias}
                  prazoMinimoDias={r.prazoMinimoDias}
                  prazoNoModulo={Boolean(r.definicao.prazoNoModulo)}
                  ativa={r.ativa}
                  podeLigar={r.simulacaoValida}
                />
                {!r.ativa && !r.simulacaoValida && (
                  <p className="text-muted-foreground text-xs">Para ligar a execução real, simule antes (a simulação vale {VALIDADE_SIMULACAO_DIAS} dias).</p>
                )}
                {r.ativa && r.ativadaEm && <p className="text-muted-foreground text-xs">Ligada em {formatarDataHora(r.ativadaEm)}.</p>}
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bloqueios por litígio</CardTitle>
              <CardDescription className="text-xs">
                Pessoa em processo judicial ou administrativo: enquanto o bloqueio estiver vigente, nenhum dado ligado ao CPF ou ao e-mail dela é apagado por estas regras. Encerre quando o processo terminar.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <NovoBloqueioForm />
              {dados.bloqueios.length > 0 && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Pessoa</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead>Processo</TableHead>
                      <TableHead>Desde</TableHead>
                      <TableHead>Situação</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dados.bloqueios.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell className="text-xs">
                          {[b.cpf ? formatarCnpjCpf(b.cpf) : null, b.email, b.tabela && b.registroId ? `${b.tabela} ${b.registroId.slice(0, 8)}` : null].filter(Boolean).join(" · ")}
                        </TableCell>
                        <TableCell className="max-w-80 text-xs whitespace-normal">{b.motivo}</TableCell>
                        <TableCell className="text-xs">{b.processo ?? "—"}</TableCell>
                        <TableCell className="text-xs">{formatarData(b.criadoEm)}</TableCell>
                        <TableCell>
                          {b.encerradoEm ? <Badge variant="secondary">Encerrado em {formatarData(b.encerradoEm)}</Badge> : <Badge variant="warning">Vigente</Badge>}
                        </TableCell>
                        <TableCell>{!b.encerradoEm && <EncerrarBloqueioBotao bloqueioId={b.id} />}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {dados.historico.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Livro de execuções</CardTitle>
                <CardDescription className="text-xs">As últimas rodadas, simuladas e reais. Só contagens: nenhum dado das pessoas fica aqui.</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Quando</TableHead>
                      <TableHead>Regra</TableHead>
                      <TableHead>Modo</TableHead>
                      <TableHead>Origem</TableHead>
                      <TableHead className="text-right">Registros</TableHead>
                      <TableHead className="text-right">Arquivos</TableHead>
                      <TableHead className="text-right">Poupados</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dados.historico.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-xs">{formatarDataHora(e.iniciadaEm)}</TableCell>
                        <TableCell className="text-xs">{e.codigo}</TableCell>
                        <TableCell>
                          {e.erro ? <Badge variant="error">Erro</Badge> : e.modo === "real" ? <Badge variant="warning">Real</Badge> : <Badge variant="secondary">Simulação</Badge>}
                        </TableCell>
                        <TableCell className="text-xs">{e.origem === "cron" ? "Cron" : "Tela"}</TableCell>
                        <TableCell className="text-right text-xs">{e.linhas.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right text-xs">{e.arquivos.toLocaleString("pt-BR")}</TableCell>
                        <TableCell className="text-right text-xs">{e.bloqueadas.toLocaleString("pt-BR")}</TableCell>
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
