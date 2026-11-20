import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, FileSpreadsheet, KeyRound, ShieldCheck, Sparkles } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { nomesDosUsuarios } from "@/lib/db/comum"
import { mesAtual, obterConfigIA } from "@/lib/db/ia-config"
import { listarChamadasIA, listarEventosGestao, resumoUsoIA, rotuloAcaoGestao, rotuloOrigem, type Dimensao } from "@/lib/db/ia-uso"
import { formatarDataHora } from "@/lib/formato"
import { MODELO_IA } from "@/lib/ia"
import { MODULOS_IA, PROCESSOS_IA, processoIA, tituloModuloIA } from "@/lib/ia-processos"

import { ChaveForm, ModelosProcessoForm, PreferenciasForm, RemoverChaveBotao, TestarChaveBotao, type UsoProcesso } from "./forms"
import { intervalo, PERIODOS, PERIODOS_PLANILHA } from "./periodos"
import { dolares, GraficoDiario, Indicador, TabelaUso, tokens } from "./uso"

export const metadata: Metadata = { title: "Inteligência Artificial — Confluir" }

const ROTA = "/painel/gestao/ia"

const ABAS: { valor: Dimensao; rotulo: string; coluna: string; filtro: string }[] = [
  { valor: "usuario", rotulo: "Por pessoa", coluna: "Pessoa", filtro: "pessoa" },
  { valor: "processo", rotulo: "Por processo", coluna: "Processo", filtro: "processo" },
  { valor: "departamento", rotulo: "Por departamento", coluna: "Departamento", filtro: "departamento" },
  { valor: "modulo", rotulo: "Por módulo", coluna: "Módulo", filtro: "modulo" },
]

type Busca = {
  periodo?: string
  por?: string
  pessoa?: string
  processo?: string
  modulo?: string
  departamento?: string
  falhas?: string
}

export default async function IAPage({ searchParams }: { searchParams: Promise<Busca> }) {
  await requirePermissao("gestao_sistema")
  const sp = await searchParams
  const periodo = PERIODOS.some((p) => p.valor === sp.periodo) ? sp.periodo! : "mes"
  const aba = ABAS.find((a) => a.valor === sp.por) ?? ABAS[0]
  const { de, ate } = intervalo(periodo)

  const [config, resumo, historico, eventos, resumoMes, resumo30] = await Promise.all([
    obterConfigIA(),
    resumoUsoIA(de, ate),
    listarChamadasIA(
      {
        de,
        ate,
        usuarioId: sp.pessoa === undefined ? null : sp.pessoa === "sem" ? "" : sp.pessoa,
        departamentoId: sp.departamento === undefined ? null : sp.departamento === "sem" ? "" : sp.departamento,
        processo: sp.processo || null,
        modulo: sp.modulo || null,
        soFalhas: sp.falhas === "1",
      },
      100
    ),
    listarEventosGestao("ia", 15),
    periodo === "mes" ? null : resumoUsoIA(mesAtual().de, mesAtual().ate),
    periodo === "30d" ? null : resumoUsoIA(intervalo("30d").de, intervalo("30d").ate),
  ])
  const usoPorProcesso: Record<string, UsoProcesso> = Object.fromEntries(
    (periodo === "30d" ? resumo : resumo30!).por.processo.map((l) => [
      l.chave,
      { chamadas: l.chamadas, tokens: l.tokensEntrada + l.tokensSaida, custo: l.custo },
    ])
  )
  const modeloGeral = config.modelo || MODELO_IA
  const sugestoesModelo = [
    ...new Set([modeloGeral, MODELO_IA, "gpt-5.5", "gpt-5.4-mini", "gpt-5.4-nano", ...Object.values(config.modelosProcesso), ...resumo.por.modelo.map((m) => m.chave)]),
  ].filter(Boolean)
  const trocados = Object.keys(config.modelosProcesso).length
  const definidaPor = config.chaveDefinidaPor ? (await nomesDosUsuarios([config.chaveDefinidaPor])).get(config.chaveDefinidaPor) : null

  const total = resumo.total
  const totalTokens = total ? total.tokensEntrada + total.tokensSaida : 0
  const temPrecos =
    (config.precoEntrada !== null && config.precoSaida !== null) ||
    Object.values(config.precosModelos).some((p) => p.entrada !== null && p.saida !== null)
  const custoMes = (periodo === "mes" ? resumo.total?.custo : resumoMes?.total?.custo) ?? 0
  const fracaoTeto = config.limiteMensalUsd ? Math.min(1, custoMes / config.limiteMensalUsd) : null

  const filtrosAtivos = Boolean(sp.pessoa !== undefined || sp.processo || sp.modulo || sp.departamento !== undefined || sp.falhas)
  const urlCom = (extra: Record<string, string | null>) => {
    const q = new URLSearchParams()
    const base: Record<string, string | undefined> = { periodo, por: aba.valor, ...sp }
    for (const [k, v] of Object.entries({ ...base, ...extra })) if (v !== null && v !== undefined && v !== "") q.set(k, v)
    return `${ROTA}?${q.toString()}`
  }
  const filtroDaLinha = (filtro: string) => (chave: string) =>
    urlCom({ pessoa: null, processo: null, modulo: null, departamento: null, falhas: null, [filtro]: chave || "sem" }) + "#historico"

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
          <Sparkles className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Inteligência Artificial</h1>
          {!config.iaAtiva && <Badge variant="destructive">IA desligada</Badge>}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          De que conta sai a IA, quanto ela é usada — por pessoa, processo, departamento e módulo — e os limites da entidade.
        </p>
      </div>

      {!config.disponivel && (
        <Alert>
          <AlertDescription>Esta área ainda está sendo instalada no banco de dados. Até lá, a IA usa a conta da plataforma e o uso não é registrado.</AlertDescription>
        </Alert>
      )}

      {config.disponivel && fracaoTeto !== null && fracaoTeto >= 0.8 && (
        <Alert variant={fracaoTeto >= 1 ? "destructive" : "default"}>
          <AlertDescription>
            {fracaoTeto >= 1
              ? config.bloquearNoLimite
                ? "O teto mensal foi atingido: a IA está parada até o dia 1º ou até o teto subir."
                : "O teto mensal foi atingido (só alerta: a IA continua funcionando)."
              : `O uso do mês chegou a ${Math.round(fracaoTeto * 100)}% do teto.`}
          </AlertDescription>
        </Alert>
      )}

      {/* ── Chave ─────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="text-muted-foreground size-4" />
              Chave de API
            </CardTitle>
            {config.temChave ? (
              <Badge variant={config.chaveIlegivel || config.chaveTesteErro ? "warning" : "success"}>
                {config.chaveIlegivel ? "Chave ilegível" : config.chaveTesteErro ? "Último teste falhou" : "Conta da entidade"}
              </Badge>
            ) : (
              <Badge variant="secondary">Conta da plataforma</Badge>
            )}
          </div>
          <CardDescription className="text-xs">
            Com a chave da entidade, o consumo vai para a conta OpenAI da própria entidade. Sem ela, a IA usa a conta da plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {config.temChave && (
            <div className="grid gap-3 rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
                <span className="font-mono">sk-…{config.chaveFinal}</span>
                <span className="text-muted-foreground text-xs">
                  Cadastrada {config.chaveDefinidaEm ? `em ${formatarDataHora(config.chaveDefinidaEm)}` : ""}
                  {definidaPor ? ` por ${definidaPor}` : ""}
                </span>
                <span className="text-muted-foreground text-xs">
                  {config.chaveTestadaEm
                    ? `Último teste ${formatarDataHora(config.chaveTestadaEm)}: ${config.chaveTesteErro ? "falhou" : "funcionou"}`
                    : "Ainda não testada"}
                </span>
              </div>
              {config.chaveTesteErro && <p className="text-destructive text-xs">{config.chaveTesteErro}</p>}
              {config.chaveIlegivel && (
                <p className="text-destructive text-xs">
                  A chave guardada não decifra neste servidor (a chave de cifra mudou). Enquanto isso a IA usa a conta da plataforma. Cadastre a chave de novo.
                </p>
              )}
              <div className="flex flex-wrap items-start gap-2">
                <TestarChaveBotao />
                <RemoverChaveBotao final={config.chaveFinal} />
              </div>
            </div>
          )}
          {!config.segredosConfigurados && (
            <Alert variant="destructive">
              <AlertDescription>
                O servidor não tem chave de cifra (SEGREDOS_CHAVE ou SAUDE_RELATORIO_CHAVE). Sem ela não é possível guardar a chave com segurança.
              </AlertDescription>
            </Alert>
          )}
          <ChaveForm temChave={config.temChave} podeGuardar={config.disponivel && config.segredosConfigurados} />
          <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
            Como a chave fica protegida: ela é cifrada (AES-256-GCM) no servidor antes de ir ao banco, com uma chave que não está no banco; nenhuma tela ou relatório a devolve, só os 4 últimos caracteres. Quem tem acesso ao banco vê apenas texto cifrado.
          </p>
        </CardContent>
      </Card>

      {/* ── Uso ───────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Uso da IA</CardTitle>
              <CardDescription className="text-xs">
                Cada chamada fica registrada com quem pediu, o processo e o departamento — nunca o texto enviado.
              </CardDescription>
            </div>
            <nav className="flex flex-wrap gap-1" aria-label="Período">
              {PERIODOS.map((p) => (
                <Button key={p.valor} size="sm" variant={p.valor === periodo ? "default" : "outline"} asChild>
                  <Link href={urlCom({ periodo: p.valor })}>{p.rotulo}</Link>
                </Button>
              ))}
            </nav>
          </div>
        </CardHeader>
        <CardContent className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Indicador rotulo="Chamadas" valor={tokens(total?.chamadas ?? 0)} />
            <Indicador
              rotulo="Tokens"
              valor={tokens(totalTokens)}
              detalhe={total ? `${tokens(total.tokensEntrada)} entrada · ${tokens(total.tokensSaida)} saída` : null}
            />
            <Indicador rotulo="Custo estimado" valor={temPrecos ? dolares(total?.custo ?? 0) : "—"} detalhe={temPrecos ? null : "Informe os preços abaixo"} />
            <Indicador
              rotulo="Falhas"
              valor={tokens(total?.falhas ?? 0)}
              detalhe={total?.bloqueadas ? `${tokens(total.bloqueadas)} ${total.bloqueadas === 1 ? "barrada" : "barradas"} pela Gestão` : null}
            />
            <Indicador rotulo="Pessoas que usaram" valor={tokens(resumo.por.usuario.filter((u) => u.chave).length)} />
          </div>

          {config.limiteMensalUsd !== null && (
            <div className="grid gap-1.5">
              <div className="flex justify-between text-xs">
                <span>Teto do mês: {dolares(custoMes)} de {dolares(config.limiteMensalUsd)}</span>
                <span className="text-muted-foreground">{config.bloquearNoLimite ? "para no teto" : "só alerta"}</span>
              </div>
              <Progress value={Math.round((fracaoTeto ?? 0) * 100)} aria-label="Uso do teto mensal" />
            </div>
          )}

          <GraficoDiario dias={resumo.por.dia} de={de} ate={ate} />

          <div className="grid gap-3">
            <nav className="flex flex-wrap gap-1 border-b pb-2" aria-label="Agrupar por">
              {ABAS.map((a) => (
                <Button key={a.valor} size="sm" variant={a.valor === aba.valor ? "secondary" : "ghost"} asChild>
                  <Link href={urlCom({ por: a.valor })} scroll={false}>
                    {a.rotulo}
                  </Link>
                </Button>
              ))}
            </nav>
            <TabelaUso
              linhas={resumo.por[aba.valor]}
              rotuloColuna={aba.coluna}
              totalTokens={totalTokens}
              mostrarCusto={temPrecos}
              hrefFiltro={(l) => filtroDaLinha(aba.filtro)(l.chave)}
            />
          </div>

          {(resumo.por.origem.length > 1 || resumo.por.modelo.length > 1) && (
            <div className="text-muted-foreground flex flex-wrap gap-x-6 gap-y-1 text-xs">
              {resumo.por.origem.length > 0 && (
                <span>
                  Conta:{" "}
                  {resumo.por.origem.map((o) => `${rotuloOrigem(o.chave)} (${tokens(o.chamadas)})`).join(" · ")}
                </span>
              )}
              {resumo.por.modelo.length > 0 && (
                <span>Modelos: {resumo.por.modelo.map((m) => `${m.chave} (${tokens(m.chamadas)})`).join(" · ")}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Planilha ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileSpreadsheet className="text-muted-foreground size-4" />
            Planilha do uso
          </CardTitle>
          <CardDescription className="text-xs">
            Para a prestação de contas ou o rateio do custo: mês × departamento, resumos por departamento, pessoa, processo, módulo e modelo, e todas as
            chamadas do período. Sem o texto enviado — o registro não o guarda.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" action={`${ROTA}/exportar`} className="flex flex-wrap items-end gap-3">
            <label className="grid gap-1 text-xs">
              Período
              <SelectNativo name="periodo" defaultValue={PERIODOS_PLANILHA.some((p) => p.valor === periodo) ? periodo : "mes"} className="w-44">
                {PERIODOS_PLANILHA.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo}
                  </option>
                ))}
              </SelectNativo>
            </label>
            <Button type="submit" size="sm" variant="outline">
              <FileSpreadsheet />
              Baixar planilha (XLSX)
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Histórico ─────────────────────────────────────────────────── */}
      <Card id="historico">
        <CardHeader>
          <CardTitle className="text-base">Histórico de chamadas</CardTitle>
          <CardDescription className="text-xs">As 100 mais recentes do período, com os filtros escolhidos.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form method="get" action={`${ROTA}#historico`} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="periodo" value={periodo} />
            <input type="hidden" name="por" value={aba.valor} />
            <label className="grid gap-1 text-xs">
              Módulo
              <SelectNativo name="modulo" defaultValue={sp.modulo ?? ""} className="w-44">
                <option value="">Todos</option>
                {MODULOS_IA.map((m) => (
                  <option key={m.slug} value={m.slug}>
                    {m.titulo}
                  </option>
                ))}
              </SelectNativo>
            </label>
            <label className="grid gap-1 text-xs">
              Processo
              <SelectNativo name="processo" defaultValue={sp.processo ?? ""} className="w-64">
                <option value="">Todos</option>
                {PROCESSOS_IA.map((p) => (
                  <option key={p.chave} value={p.chave}>
                    {p.titulo}
                  </option>
                ))}
              </SelectNativo>
            </label>
            {sp.pessoa !== undefined && <input type="hidden" name="pessoa" value={sp.pessoa} />}
            {sp.departamento !== undefined && <input type="hidden" name="departamento" value={sp.departamento} />}
            <label className="flex items-center gap-2 pb-1.5 text-xs">
              <input type="checkbox" name="falhas" value="1" defaultChecked={sp.falhas === "1"} />
              Só falhas
            </label>
            <Button type="submit" size="sm" variant="outline">
              Filtrar
            </Button>
            {filtrosAtivos && (
              <Button size="sm" variant="ghost" asChild>
                <Link href={urlCom({ pessoa: null, processo: null, modulo: null, departamento: null, falhas: null }) + "#historico"}>Limpar filtros</Link>
              </Button>
            )}
          </form>
          {(sp.pessoa !== undefined || sp.departamento !== undefined) && (
            <p className="text-muted-foreground text-xs">
              {sp.pessoa !== undefined && `Pessoa: ${sp.pessoa === "sem" ? "sem pessoa" : (resumo.por.usuario.find((u) => u.chave === sp.pessoa)?.rotulo ?? "selecionada")}. `}
              {sp.departamento !== undefined &&
                `Departamento: ${sp.departamento === "sem" ? "sem departamento" : (resumo.por.departamento.find((d) => d.chave === sp.departamento)?.rotulo ?? "selecionado")}.`}
            </p>
          )}
          {historico.chamadas.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma chamada com esses filtros.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Quando</TableHead>
                    <TableHead>Pessoa</TableHead>
                    <TableHead>Processo</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    {temPrecos && <TableHead className="text-right">Custo</TableHead>}
                    <TableHead>Resultado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historico.chamadas.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{formatarDataHora(c.criadoEm)}</TableCell>
                      <TableCell>
                        {c.pessoa ?? <span className="text-muted-foreground">—</span>}
                        {c.departamento && <span className="text-muted-foreground block text-xs">{c.departamento}</span>}
                      </TableCell>
                      <TableCell className="max-w-72">
                        {processoIA(c.processo).titulo}
                        <span className="text-muted-foreground block text-xs">
                          {tituloModuloIA(c.modulo)} · {c.modelo}
                          {c.origem === "entidade" ? " · conta da entidade" : ""}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{tokens(c.tokensEntrada + c.tokensSaida)}</TableCell>
                      {temPrecos && <TableCell className="text-right tabular-nums">{dolares(c.custo)}</TableCell>}
                      <TableCell className="max-w-64">
                        {c.sucesso ? (
                          <Badge variant="success">ok</Badge>
                        ) : (
                          <>
                            <Badge variant={c.origem === "bloqueada" ? "warning" : "destructive"}>{c.origem === "bloqueada" ? "barrada" : "falhou"}</Badge>
                            {c.erro && <span className="text-muted-foreground block text-xs">{c.erro}</span>}
                          </>
                        )}
                        {c.duracaoMs !== null && c.sucesso && (
                          <span className="text-muted-foreground block text-xs">{(c.duracaoMs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} s</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Configuração ──────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Configuração</CardTitle>
          <CardDescription className="text-xs">Ligar e desligar a IA, por módulo; modelo; preços para estimar o custo e o teto mensal.</CardDescription>
        </CardHeader>
        <CardContent>
          <PreferenciasForm
            inicial={{
              modelo: config.modelo,
              modeloPadrao: MODELO_IA,
              iaAtiva: config.iaAtiva,
              modulosDesligados: config.modulosDesligados,
              limiteMensalUsd: config.limiteMensalUsd,
              bloquearNoLimite: config.bloquearNoLimite,
              precoEntrada: config.precoEntrada,
              precoEntradaCache: config.precoEntradaCache,
              precoSaida: config.precoSaida,
            }}
          />
        </CardContent>
      </Card>

      {/* ── Modelo por processo ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Modelo por processo</CardTitle>
            <Badge variant="secondary">{trocados ? `${trocados} com modelo próprio` : "todos no modelo geral"}</Badge>
          </div>
          <CardDescription className="text-xs">
            Um modelo menor nos processos simples (redigir textos curtos, resumos) e o modelo geral onde a leitura pesa (PDF, CAT, contracheque). É a maior alavanca
            de custo. Em branco, o processo usa o modelo geral ({modeloGeral}). Com a chave da entidade, cada modelo novo é testado antes de salvar; para ler PDF e
            imagem, o modelo precisa aceitar arquivos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ModelosProcessoForm
            inicial={{
              modeloGeral,
              modelos: config.modelosProcesso,
              precos: config.precosModelos,
              sugestoes: sugestoesModelo,
              uso: usoPorProcesso,
              temTeto: config.limiteMensalUsd !== null,
            }}
          />
        </CardContent>
      </Card>

      {eventos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Alterações</CardTitle>
            <CardDescription className="text-xs">Quem mexeu na chave e na configuração da IA.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {eventos.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span>
                    <span className="font-medium">{rotuloAcaoGestao(e.acao)}</span>
                    {e.detalhe && <span className="text-muted-foreground"> — {e.detalhe}</span>}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {e.pessoa ?? "—"} · {formatarDataHora(e.criadoEm)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  )
}
