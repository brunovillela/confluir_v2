import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, FileSpreadsheet, Mail } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarEnvios, resumoEmails, type DimensaoEmail, type EnvioEmail, type LinhaEmail } from "@/lib/db/email-uso"
import { FILTROS_SITUACAO, MODULOS_EMAIL, PROCESSOS_EMAIL, processoEmail, ROTULO_ESTADO, tituloModuloEmail, type EstadoEnvio } from "@/lib/email-processos"
import { formatarDataHora } from "@/lib/formato"

import { Indicador } from "../ia/uso"
import { intervalo, PERIODOS, PERIODOS_PLANILHA } from "../ia/periodos"

export const metadata: Metadata = { title: "E-mail — Confluir" }

const ROTA = "/painel/gestao/email"
const POR_PAGINA = 100
const inteiro = new Intl.NumberFormat("pt-BR")

const ABAS: { valor: DimensaoEmail; rotulo: string; coluna: string; filtro: string | null }[] = [
  { valor: "processo", rotulo: "Por processo", coluna: "Processo", filtro: "processo" },
  { valor: "modulo", rotulo: "Por módulo", coluna: "Módulo", filtro: "modulo" },
  { valor: "usuario", rotulo: "Por pessoa", coluna: "Quem disparou", filtro: "pessoa" },
  { valor: "departamento", rotulo: "Por departamento", coluna: "Departamento", filtro: "departamento" },
  { valor: "situacao", rotulo: "Por situação", coluna: "Situação no envio", filtro: null },
  { valor: "dia", rotulo: "Por dia", coluna: "Dia", filtro: null },
]

type Busca = {
  periodo?: string
  por?: string
  q?: string
  processo?: string
  modulo?: string
  pessoa?: string
  departamento?: string
  situacao?: string
  pagina?: string
}

function pct(parte: number, todo: number): string {
  if (!todo) return "—"
  const v = (parte / todo) * 100
  return `${v.toLocaleString("pt-BR", { maximumFractionDigits: v < 10 ? 1 : 0 })}%`
}

const COR_ESTADO: Record<EstadoEnvio, "success" | "destructive" | "warning" | "secondary" | "outline"> = {
  entregue: "success",
  rejeitado: "destructive",
  falhou: "destructive",
  adiado: "warning",
  aguardando: "outline",
  teste: "secondary",
  sem_configuracao: "secondary",
  enviando: "outline",
}

/** Envios por dia: barras da cor primária; a parte rejeitada ou que não saiu em vermelho no topo. */
function GraficoEnvios({ dias: comEnvio, de, ate }: { dias: LinhaEmail[]; de: Date; ate: Date }) {
  if (comEnvio.length === 0) return null
  const porDia = new Map(comEnvio.map((d) => [d.chave, d]))
  const dias: LinhaEmail[] = []
  const umDia = 24 * 3600_000
  for (let t = de.getTime(); t < ate.getTime() && dias.length < 120; t += umDia) {
    const chave = new Date(t - 3 * 3600_000).toISOString().slice(0, 10)
    if (dias.some((d) => d.chave === chave)) continue
    dias.push(porDia.get(chave) ?? { chave, rotulo: chave.split("-").reverse().join("/"), detalhe: null, enviados: 0, falhas: 0, entregues: 0, rejeitados: 0, ultima: null })
  }
  const max = Math.max(...dias.map((d) => d.enviados), 1)
  return (
    <figure className="grid gap-2">
      <figcaption className="text-muted-foreground text-xs">E-mails por dia (em vermelho, os rejeitados ou que não saíram)</figcaption>
      <div className="flex h-32 items-end justify-between gap-0.5 border-b" role="img" aria-label="E-mails enviados por dia no período">
        {dias.map((d) => {
          const altura = d.enviados > 0 ? Math.max(2, Math.round((d.enviados / max) * 100)) : 0
          const ruins = Math.min(d.enviados, d.falhas + d.rejeitados)
          const fracaoRuim = d.enviados > 0 ? ruins / d.enviados : 0
          return (
            <div key={d.chave} className="group relative flex h-full max-w-6 min-w-1 flex-1 items-end">
              <div className="flex w-full flex-col overflow-hidden rounded-t-[4px]" style={{ height: `${altura}%` }}>
                {ruins > 0 && <div className="bg-destructive w-full" style={{ height: `${Math.max(8, Math.round(fracaoRuim * 100))}%` }} />}
                <div className="bg-primary group-hover:bg-primary/80 w-full flex-1" />
              </div>
              <div className="bg-popover text-popover-foreground pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-md border px-2 py-1 text-xs whitespace-nowrap shadow-sm group-hover:block">
                <span className="font-medium">{d.rotulo}</span>
                <span className="block tabular-nums">
                  {inteiro.format(d.enviados)} e-mails · {inteiro.format(d.entregues)} entregues
                </span>
                {ruins > 0 && <span className="block tabular-nums">{inteiro.format(ruins)} rejeitados ou não saíram</span>}
              </div>
            </div>
          )
        })}
      </div>
      <div className="text-muted-foreground flex justify-between text-xs tabular-nums">
        <span>{dias[0].rotulo}</span>
        <span>{dias[dias.length - 1].rotulo}</span>
      </div>
    </figure>
  )
}

function TabelaEmail({ linhas, coluna, total, href }: { linhas: LinhaEmail[]; coluna: string; total: number; href?: (l: LinhaEmail) => string }) {
  if (linhas.length === 0) return <p className="text-muted-foreground text-sm">Nenhum e-mail no período.</p>
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{coluna}</TableHead>
            <TableHead className="text-right">E-mails</TableHead>
            <TableHead className="w-32">Fatia</TableHead>
            <TableHead className="text-right">Entregues</TableHead>
            <TableHead className="text-right">Rejeitados</TableHead>
            <TableHead className="text-right">Não saíram</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((l) => {
            const fatia = total > 0 ? l.enviados / total : 0
            return (
              <TableRow key={l.chave || "vazio"}>
                <TableCell className="max-w-80">
                  {href ? (
                    <Link href={href(l)} className="underline-offset-4 hover:underline">
                      {l.rotulo}
                    </Link>
                  ) : (
                    l.rotulo
                  )}
                  {l.detalhe && <span className="text-muted-foreground block text-xs">{l.detalhe}</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">{inteiro.format(l.enviados)}</TableCell>
                <TableCell>
                  <div className="bg-muted h-1.5 w-full rounded-full" title={`${Math.round(fatia * 100)}% dos e-mails`}>
                    <div className="bg-primary h-1.5 rounded-full" style={{ width: `${Math.max(fatia > 0 ? 2 : 0, Math.round(fatia * 100))}%` }} />
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">{inteiro.format(l.entregues)}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.rejeitados ? <span className="text-destructive">{inteiro.format(l.rejeitados)}</span> : <span className="text-muted-foreground">0</span>}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {l.falhas ? <span className="text-destructive">{inteiro.format(l.falhas)}</span> : <span className="text-muted-foreground">0</span>}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function DetalheEnvio({ e }: { e: EnvioEmail }) {
  const partes: string[] = []
  if (e.estado === "entregue" && e.entregueEm) partes.push(`entregue ${formatarDataHora(e.entregueEm)}`)
  if (e.estado === "adiado" && e.adiadoEm) partes.push(`adiado ${formatarDataHora(e.adiadoEm)}; o provedor tenta de novo`)
  if (e.estado === "rejeitado") partes.push(e.rejeicao ?? "rejeição definitiva")
  if (e.estado === "falhou" && e.erro) partes.push(e.erro)
  if (e.anexos) partes.push(`${e.anexos} ${e.anexos === 1 ? "anexo" : "anexos"}`)
  return partes.length ? <span className="text-muted-foreground block text-xs">{partes.join(" · ")}</span> : null
}

export default async function EmailGestaoPage({ searchParams }: { searchParams: Promise<Busca> }) {
  await requirePermissao("gestao_sistema")
  const sp = await searchParams
  const periodo = PERIODOS.some((p) => p.valor === sp.periodo) ? sp.periodo! : "mes"
  const aba = ABAS.find((a) => a.valor === sp.por) ?? ABAS[0]
  const { de, ate } = intervalo(periodo)
  const pagina = Math.max(1, Math.min(500, Number.parseInt(sp.pagina ?? "1", 10) || 1))

  const [resumo, historico] = await Promise.all([
    resumoEmails(de, ate),
    listarEnvios(
      {
        de,
        ate,
        destinatario: sp.q || null,
        processo: sp.processo || null,
        modulo: sp.modulo || null,
        usuarioId: sp.pessoa === undefined ? null : sp.pessoa === "sem" ? "" : sp.pessoa,
        departamentoId: sp.departamento === undefined ? null : sp.departamento === "sem" ? "" : sp.departamento,
        situacao: sp.situacao || null,
      },
      POR_PAGINA + 1,
      (pagina - 1) * POR_PAGINA
    ),
  ])
  const total = resumo.total
  const enviados = total?.enviados ?? 0
  const testes = resumo.por.situacao.find((s) => s.chave === "teste")?.enviados ?? 0
  const reais = enviados - testes
  const haMais = historico.envios.length > POR_PAGINA
  const envios = historico.envios.slice(0, POR_PAGINA)
  const filtrosAtivos = Boolean(sp.q || sp.processo || sp.modulo || sp.pessoa !== undefined || sp.departamento !== undefined || sp.situacao)

  const urlCom = (extra: Record<string, string | null>) => {
    const q = new URLSearchParams()
    const base: Record<string, string | undefined> = { periodo, por: aba.valor, ...sp }
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== null && v !== undefined && v !== "") q.set(k, v)
    return `${ROTA}?${q.toString()}`
  }
  const filtroDaLinha = (filtro: string) => (l: LinhaEmail) =>
    urlCom({ q: null, processo: null, modulo: null, pessoa: null, departamento: null, situacao: null, pagina: null, [filtro]: l.chave || "sem" }) + "#historico"

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/gestao">
            <ArrowLeft />
            Gestão
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Mail className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">E-mail</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Os e-mails que o sistema envia — por processo, módulo, pessoa e departamento — e se chegaram. Não guarda assunto nem texto, só quem recebeu e o
          resultado.
        </p>
      </div>

      {!resumo.disponivel && (
        <Alert>
          <AlertDescription>O registro dos e-mails ainda está sendo instalado no banco de dados.</AlertDescription>
        </Alert>
      )}

      {/* ── Uso ───────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base">E-mails enviados</CardTitle>
              <CardDescription className="text-xs">
                A entrega e a rejeição chegam do provedor (Brevo) segundos ou minutos depois do envio.
              </CardDescription>
            </div>
            <nav className="flex flex-wrap gap-1" aria-label="Período">
              {PERIODOS.map((p) => (
                <Button key={p.valor} size="sm" variant={p.valor === periodo ? "default" : "outline"} asChild>
                  <Link href={urlCom({ periodo: p.valor, pagina: null })}>{p.rotulo}</Link>
                </Button>
              ))}
            </nav>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Indicador
              rotulo="E-mails"
              valor={inteiro.format(enviados)}
              detalhe={testes ? `${inteiro.format(testes)} de teste, não entregues` : null}
            />
            <Indicador rotulo="Entregues" valor={inteiro.format(total?.entregues ?? 0)} detalhe={reais ? `${pct(total?.entregues ?? 0, reais)} dos enviados` : null} />
            <Indicador
              rotulo="Rejeitados"
              valor={inteiro.format(total?.rejeitados ?? 0)}
              detalhe={reais ? `${pct(total?.rejeitados ?? 0, reais)} — acima de 5% prejudica a reputação do domínio` : null}
            />
            <Indicador rotulo="Não saíram" valor={inteiro.format(total?.falhas ?? 0)} detalhe="o provedor recusou ou não respondeu" />
          </div>

          <GraficoEnvios dias={resumo.por.dia} de={de} ate={ate} />

          <div className="grid gap-3">
            <nav className="flex flex-wrap gap-1" aria-label="Agrupar por">
              {ABAS.map((a) => (
                <Button key={a.valor} size="sm" variant={a.valor === aba.valor ? "secondary" : "ghost"} asChild>
                  <Link href={urlCom({ por: a.valor })}>{a.rotulo}</Link>
                </Button>
              ))}
            </nav>
            <TabelaEmail
              linhas={aba.valor === "dia" ? [...resumo.por.dia].reverse() : resumo.por[aba.valor]}
              coluna={aba.coluna}
              total={enviados}
              href={aba.filtro ? filtroDaLinha(aba.filtro) : undefined}
            />
          </div>
        </CardContent>
      </Card>

      {/* ── Planilha ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="text-muted-foreground size-4" />
            Planilha dos e-mails
          </CardTitle>
          <CardDescription className="text-xs">Resumos por processo, módulo, pessoa e departamento, e todos os envios do período, com o destinatário.</CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" action={`${ROTA}/exportar`} className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="periodo-planilha" className="text-xs">
                Período
              </Label>
              <SelectNativo id="periodo-planilha" name="periodo" defaultValue={periodo === "mes_anterior" ? "mes_anterior" : "mes"} className="w-48">
                {PERIODOS_PLANILHA.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo}
                  </option>
                ))}
              </SelectNativo>
            </div>
            <Button type="submit" variant="outline">
              <FileSpreadsheet />
              Baixar planilha
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Histórico ─────────────────────────────────────────────────── */}
      <Card id="historico">
        <CardHeader>
          <CardTitle className="text-base">Histórico de envios</CardTitle>
          <CardDescription className="text-xs">Para responder &quot;o e-mail chegou para fulano?&quot;: busque pelo endereço.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form method="get" action={`${ROTA}#historico`} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="periodo" value={periodo} />
            <input type="hidden" name="por" value={aba.valor} />
            {sp.pessoa !== undefined && <input type="hidden" name="pessoa" value={sp.pessoa} />}
            {sp.departamento !== undefined && <input type="hidden" name="departamento" value={sp.departamento} />}
            <div className="grid gap-1.5">
              <Label htmlFor="q" className="text-xs">
                Destinatário
              </Label>
              <Input id="q" name="q" defaultValue={sp.q ?? ""} placeholder="nome@empresa.com ou parte" className="w-60" autoComplete="off" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="processo" className="text-xs">
                Processo
              </Label>
              <SelectNativo id="processo" name="processo" defaultValue={sp.processo ?? ""} className="w-72">
                <option value="">Todos</option>
                {MODULOS_EMAIL.map((m) => {
                  const ps = PROCESSOS_EMAIL.filter((p) => p.modulo === m.slug)
                  return ps.length ? (
                    <optgroup key={m.slug} label={m.titulo}>
                      {ps.map((p) => (
                        <option key={p.chave} value={p.chave}>
                          {p.titulo}
                        </option>
                      ))}
                    </optgroup>
                  ) : null
                })}
              </SelectNativo>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="situacao" className="text-xs">
                Situação
              </Label>
              <SelectNativo id="situacao" name="situacao" defaultValue={sp.situacao ?? ""} className="w-64">
                <option value="">Todas</option>
                {FILTROS_SITUACAO.map((s) => (
                  <option key={s.valor} value={s.valor}>
                    {s.rotulo}
                  </option>
                ))}
              </SelectNativo>
            </div>
            <Button type="submit" variant="outline">
              Filtrar
            </Button>
            {filtrosAtivos && (
              <Button variant="ghost" asChild>
                <Link href={urlCom({ q: null, processo: null, modulo: null, pessoa: null, departamento: null, situacao: null, pagina: null }) + "#historico"}>
                  Limpar filtros
                </Link>
              </Button>
            )}
          </form>
          {sp.modulo && <p className="text-muted-foreground text-xs">Só o módulo {tituloModuloEmail(sp.modulo)}.</p>}
          {(sp.pessoa !== undefined || sp.departamento !== undefined) && (
            <p className="text-muted-foreground text-xs">Filtrado pela linha escolhida no resumo ({sp.pessoa !== undefined ? "pessoa" : "departamento"}).</p>
          )}

          {envios.length === 0 ? (
            <p className="text-muted-foreground text-sm">{filtrosAtivos ? "Nenhum e-mail com esses filtros no período." : "Nenhum e-mail no período."}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Destinatário</TableHead>
                    <TableHead>Processo</TableHead>
                    <TableHead>Quem disparou</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {envios.map((e) => {
                    const p = processoEmail(e.processo)
                    return (
                      <TableRow key={e.id}>
                        <TableCell className="align-top text-xs whitespace-nowrap tabular-nums">{formatarDataHora(e.criadoEm)}</TableCell>
                        <TableCell className="align-top text-sm break-all">{e.destinatario ?? <span className="text-muted-foreground">(apagado pela retenção)</span>}</TableCell>
                        <TableCell className="max-w-72 align-top">
                          <span className="text-sm">{p.titulo}</span>
                          <span className="text-muted-foreground block text-xs">{tituloModuloEmail(p.modulo)}</span>
                        </TableCell>
                        <TableCell className="align-top text-xs">
                          {e.pessoa ?? <span className="text-muted-foreground">automático ou público</span>}
                          {e.departamento && <span className="text-muted-foreground block">{e.departamento}</span>}
                        </TableCell>
                        <TableCell className="align-top">
                          <Badge variant={COR_ESTADO[e.estado]}>{ROTULO_ESTADO[e.estado]}</Badge>
                          <DetalheEnvio e={e} />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
          {(pagina > 1 || haMais) && (
            <div className="flex items-center justify-between gap-2">
              <p className="text-muted-foreground text-xs">
                E-mails {inteiro.format((pagina - 1) * POR_PAGINA + 1)}–{inteiro.format((pagina - 1) * POR_PAGINA + envios.length)}
              </p>
              <div className="flex gap-2">
                {pagina > 1 && (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={urlCom({ pagina: pagina - 1 > 1 ? String(pagina - 1) : null }) + "#historico"}>Mais recentes</Link>
                  </Button>
                )}
                {haMais && (
                  <Button size="sm" variant="outline" asChild>
                    <Link href={urlCom({ pagina: String(pagina + 1) }) + "#historico"}>Mais antigos</Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
