import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, TreePalm } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Paginacao } from "@/components/paginacao"
import { requirePermissao } from "@/lib/auth"
import { listarPeriodosFerias, resumoPeriodo, type PeriodoFerias } from "@/lib/db/ferias"
import { listarFuncionarios } from "@/lib/db/pessoal"
import {
  anosComGozo,
  DIAS_ALERTA_CONCESSIVO,
  distribuicaoPorMes,
  gozoAguardandoAutorizacao,
  ORDEM_SITUACAO,
  ROTULO_SITUACAO,
  situacaoDoFuncionario,
  type ChaveSituacao,
} from "@/lib/ferias-painel"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { semAcento } from "@/lib/texto"
import { cn } from "@/lib/utils"

import { AutorizarGozoBotao } from "./[id]/gozo-itens"
import { DistribuicaoMensal } from "./distribuicao-mensal"
import { ExcluirPeriodoBotao } from "./excluir-periodo"
import { BadgeSituacao, DetalheSituacao } from "./situacao-ferias"

export const metadata: Metadata = { title: "Férias — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type ParamsLista = {
  aba?: string
  salvo?: string
  excluido?: string
  busca?: string
  situacao?: string
  estado?: string
  ano?: string
  pagina?: string
  porPagina?: string
}

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
}

export default async function FeriasPage({
  searchParams,
}: {
  searchParams: Promise<ParamsLista>
}) {
  await requirePermissao("pessoal_gestao")

  const brutos = await searchParams
  const { salvo, excluido } = brutos
  const aba = brutos.aba === "periodos" ? "periodos" : "painel"
  const periodos = await listarPeriodosFerias()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal">
            <ArrowLeft />
            Pessoal
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Férias</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Cada período pode ter até 3 gozos (um deles com no mínimo 14 dias); o dia de início
              conta como o primeiro dia de férias
            </p>
          </div>
          <Button asChild>
            <Link href="/painel/pessoal/ferias/novo">
              <Plus />
              Novo período
            </Link>
          </Button>
        </div>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Período salvo.</AlertDescription>
        </Alert>
      )}
      {excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Período excluído.</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-1.5" role="group" aria-label="Escolher a visão">
        <Button variant={aba === "painel" ? "default" : "outline"} size="sm" asChild>
          <Link href="/painel/pessoal/ferias">Painel</Link>
        </Button>
        <Button variant={aba === "periodos" ? "default" : "outline"} size="sm" asChild>
          <Link href="/painel/pessoal/ferias?aba=periodos">Todos os períodos</Link>
        </Button>
      </div>

      {aba === "painel" ? (
        <PainelFerias periodos={periodos} brutos={brutos} />
      ) : (
        <ListaPeriodos periodos={periodos} brutos={brutos} />
      )}
    </>
  )
}

// ── Painel ──────────────────────────────────────────────────────────────────

function Kpi({
  titulo,
  valor,
  detalhe,
  alerta,
  href,
}: {
  titulo: string
  valor: React.ReactNode
  detalhe: string
  alerta?: boolean
  href?: string
}) {
  const corpo = (
    <>
      <p className="text-muted-foreground text-xs">{titulo}</p>
      <p className={cn("text-3xl font-semibold tabular-nums", alerta && "text-destructive")}>
        {valor}
      </p>
      <p className="text-muted-foreground text-xs">{detalhe}</p>
    </>
  )
  const classe = "bg-card rounded-xl border p-4 shadow-xs"
  return href ? (
    <Link href={href} className={cn(classe, "hover:border-primary/50 block transition-colors")}>
      {corpo}
    </Link>
  ) : (
    <div className={classe}>{corpo}</div>
  )
}

async function PainelFerias({
  periodos,
  brutos,
}: {
  periodos: PeriodoFerias[]
  brutos: ParamsLista
}) {
  const hoje = hojeSP()
  const anoAtual = Number(hoje.slice(0, 4))
  const anos = anosComGozo(periodos, anoAtual)
  const ano = anos.includes(Number(brutos.ano)) ? Number(brutos.ano) : anoAtual
  const meses = distribuicaoPorMes(periodos, ano)
  const totalAno = meses.reduce((s, m) => s + m.autorizados + m.aguardando, 0)

  // Funcionários ativos + a situação de férias de cada um.
  const { linhas: ativos } = await listarFuncionarios({ situacao: "ativos" })
  const porTrabalhador = new Map<string, PeriodoFerias[]>()
  for (const p of periodos) {
    if (!p.trabalhador_id) continue
    porTrabalhador.set(p.trabalhador_id, [...(porTrabalhador.get(p.trabalhador_id) ?? []), p])
  }
  const funcionarios = ativos.map((f) => ({
    usuarioId: f.usuarioId,
    nome: f.nome ?? "(sem nome)",
    cargo: f.cargo,
    situacao: situacaoDoFuncionario(
      porTrabalhador.get(f.usuarioId) ?? [],
      hoje,
      f.contrato_admissao
    ),
  }))
  const contagem = (c: ChaveSituacao) => funcionarios.filter((f) => f.situacao.chave === c).length
  const saldoTotal = funcionarios.reduce((s, f) => s + f.situacao.saldo, 0)

  // Gozos aguardando autorização (de qualquer funcionário, ativos ou não).
  const pendentes = periodos
    .flatMap((p) =>
      p.gozos
        .filter(gozoAguardandoAutorizacao)
        .map((g) => ({ ...g, periodoId: p.id, nome: p.funcionarioNome ?? "(sem nome)", trabalhadorId: p.trabalhador_id }))
    )
    .sort((a, b) => (a.inicio ?? "").localeCompare(b.inicio ?? ""))
  const pendentesAtrasados = pendentes.filter((g) => g.inicio && g.inicio <= hoje).length

  // Lista de funcionários: filtro por situação + busca pelo nome.
  const estado = (ORDEM_SITUACAO as string[]).includes(brutos.estado ?? "")
    ? (brutos.estado as ChaveSituacao)
    : null
  const busca = semAcento((brutos.busca ?? "").trim())
  const lista = funcionarios
    .filter((f) => (!estado || f.situacao.chave === estado) && (!busca || semAcento(f.nome).includes(busca)))
    .sort(
      (a, b) =>
        ORDEM_SITUACAO.indexOf(a.situacao.chave) - ORDEM_SITUACAO.indexOf(b.situacao.chave) ||
        a.nome.localeCompare(b.nome, "pt-BR")
    )
  const urlEstado = (c: ChaveSituacao | null) => {
    const q = new URLSearchParams()
    if (c) q.set("estado", c)
    if (brutos.busca) q.set("busca", brutos.busca)
    if (brutos.ano) q.set("ano", brutos.ano)
    const s = q.toString()
    return `/painel/pessoal/ferias${s ? `?${s}` : ""}#funcionarios`
  }
  const urlAno = (a: number) =>
    `/painel/pessoal/ferias?ano=${a}${estado ? `&estado=${estado}` : ""}#distribuicao`
  const idxAno = anos.indexOf(ano)

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi
          titulo="Em férias hoje"
          valor={contagem("em_ferias")}
          detalhe={`de ${funcionarios.length} funcionário${funcionarios.length === 1 ? "" : "s"} ativos`}
          href={urlEstado("em_ferias")}
        />
        <Kpi
          titulo="Aguardando autorização"
          valor={pendentes.length}
          detalhe={
            pendentesAtrasados > 0
              ? `${pendentesAtrasados} já ${pendentesAtrasados === 1 ? "começou" : "começaram"} sem autorização`
              : "gozos pedidos"
          }
          alerta={pendentesAtrasados > 0}
          href="#pendentes"
        />
        <Kpi
          titulo="Prazo vencendo"
          valor={contagem("vencendo")}
          detalhe={`concessivo com saldo em até ${DIAS_ALERTA_CONCESSIVO} dias`}
          href={urlEstado("vencendo")}
        />
        <Kpi
          titulo="Períodos vencidos"
          valor={contagem("vencido")}
          detalhe="concessivo encerrado com saldo"
          alerta={contagem("vencido") > 0}
          href={urlEstado("vencido")}
        />
        <Kpi
          titulo="Dias a gozar"
          valor={saldoTotal}
          detalhe="saldo dos períodos em aberto"
        />
      </div>

      <Card id="distribuicao" className="scroll-mt-20">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Distribuição das férias por mês</CardTitle>
              <CardDescription>
                Dias de férias em {ano}: {totalAno} — cada gozo conta nos meses que atravessa.
              </CardDescription>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                asChild={idxAno < anos.length - 1}
                disabled={idxAno >= anos.length - 1}
                aria-label="Ano anterior"
              >
                {idxAno < anos.length - 1 ? (
                  <Link href={urlAno(anos[idxAno + 1])}>
                    <ChevronLeft />
                  </Link>
                ) : (
                  <ChevronLeft />
                )}
              </Button>
              <span className="w-12 text-center text-sm font-medium tabular-nums">{ano}</span>
              <Button
                variant="outline"
                size="icon"
                className="size-8"
                asChild={idxAno > 0}
                disabled={idxAno <= 0}
                aria-label="Próximo ano"
              >
                {idxAno > 0 ? (
                  <Link href={urlAno(anos[idxAno - 1])}>
                    <ChevronRight />
                  </Link>
                ) : (
                  <ChevronRight />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <DistribuicaoMensal
            meses={meses}
            mesAtual={ano === anoAtual ? Number(hoje.slice(5, 7)) - 1 : null}
          />
        </CardContent>
      </Card>

      <Card id="pendentes" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base">
            Aguardando autorização
            <span className="text-muted-foreground ml-2 text-sm font-normal">{pendentes.length}</span>
          </CardTitle>
          <CardDescription>
            Autorizar avisa o funcionário por notificação e e-mail; com venda de 1/3 pedida, a
            autorização confirma o abono.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pendentes.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhum gozo aguardando autorização.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Funcionário</TableHead>
                    <TableHead>Início</TableHead>
                    <TableHead>Último dia</TableHead>
                    <TableHead className="text-right">Dias</TableHead>
                    <TableHead className="hidden md:table-cell">Pedido em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendentes.map((g) => (
                    <TableRow key={g.id}>
                      <TableCell className="max-w-56 font-medium">
                        {g.trabalhadorId ? (
                          <Link
                            href={`/painel/pessoal/ferias/funcionario/${g.trabalhadorId}`}
                            className="block truncate hover:underline"
                          >
                            {g.nome}
                          </Link>
                        ) : (
                          g.nome
                        )}
                        {g.abono_solicitado === true && (
                          <Badge variant="outline" className="border-info/40 text-info-fg mt-0.5">
                            Venda de 1/3
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "whitespace-nowrap",
                          g.inicio && g.inicio <= hoje && "text-destructive font-medium"
                        )}
                      >
                        {formatarData(g.inicio)}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatarData(g.termino)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{g.dias ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground hidden whitespace-nowrap md:table-cell">
                        {formatarData(g.created_at)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <AutorizarGozoBotao
                          periodoId={g.periodoId}
                          gozoId={g.id}
                          autorizado={false}
                          temAbono={g.abono_solicitado === true}
                        />
                        <Button variant="ghost" size="sm" asChild className="h-7 px-2">
                          <Link href={`/painel/pessoal/ferias/${g.periodoId}`}>Abrir</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card id="funcionarios" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base">
            Funcionários
            <span className="text-muted-foreground ml-2 text-sm font-normal">
              {lista.length} de {funcionarios.length}
            </span>
          </CardTitle>
          <CardDescription>
            Situação atual de cada funcionário ativo. Clique no nome para ver o histórico de
            férias e abrir um novo período.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <Button size="sm" variant={estado ? "outline" : "secondary"} asChild>
              <Link href={urlEstado(null)}>Todos</Link>
            </Button>
            {ORDEM_SITUACAO.map((c) => (
              <Button key={c} size="sm" variant={estado === c ? "secondary" : "outline"} asChild>
                <Link href={urlEstado(c)}>
                  {ROTULO_SITUACAO[c]}
                  <Badge variant="outline" className="ml-1.5 tabular-nums">
                    {contagem(c)}
                  </Badge>
                </Link>
              </Button>
            ))}
          </div>
          <form method="GET" action="/painel/pessoal/ferias#funcionarios" className="flex gap-2">
            {estado && <input type="hidden" name="estado" value={estado} />}
            {brutos.ano && <input type="hidden" name="ano" value={brutos.ano} />}
            <Input
              name="busca"
              defaultValue={brutos.busca ?? ""}
              placeholder="Nome do funcionário"
              className="h-9 w-full sm:max-w-56"
              aria-label="Buscar funcionário"
            />
            <Button type="submit" variant="secondary" size="sm">
              Buscar
            </Button>
          </form>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                  <TableHead className="hidden md:table-cell">Próximas férias</TableHead>
                  <TableHead className="hidden lg:table-cell">Prazo do concessivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground h-20 text-center text-sm">
                      Nenhum funcionário nesta situação.
                    </TableCell>
                  </TableRow>
                )}
                {lista.map((f) => (
                  <TableRow key={f.usuarioId} className="hover:bg-muted/40">
                    <TableCell className="max-w-64">
                      <Link
                        href={`/painel/pessoal/ferias/funcionario/${f.usuarioId}`}
                        className="block truncate font-medium hover:underline"
                      >
                        {f.nome}
                      </Link>
                      {f.cargo && (
                        <span className="text-muted-foreground block truncate text-xs">{f.cargo}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <BadgeSituacao chave={f.situacao.chave} />
                      {f.situacao.detalhe && (
                        <span className="text-muted-foreground ml-1.5 text-xs whitespace-nowrap">
                          <DetalheSituacao situacao={f.situacao} />
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{f.situacao.saldo}</TableCell>
                    <TableCell className="text-muted-foreground hidden whitespace-nowrap md:table-cell">
                      {f.situacao.proximoGozo ? (
                        <>
                          {formatarData(f.situacao.proximoGozo.inicio)}
                          {!f.situacao.proximoGozo.autorizado && (
                            <span className="text-warning-fg ml-1 text-xs">(aguardando)</span>
                          )}
                        </>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden whitespace-nowrap lg:table-cell">
                      {formatarData(f.situacao.prazo)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  )
}

// ── Todos os períodos ───────────────────────────────────────────────────────

function ListaPeriodos({
  periodos,
  brutos,
}: {
  periodos: PeriodoFerias[]
  brutos: ParamsLista
}) {
  const params = {
    busca: (brutos.busca ?? "").trim(),
    situacao: ["abertos", "finalizados"].includes(brutos.situacao ?? "")
      ? brutos.situacao!
      : "todos",
  }

  const filtrados = periodos.filter((p) => {
    if (
      params.busca &&
      !(p.funcionarioNome ?? "")
        .toLocaleLowerCase("pt-BR")
        .includes(params.busca.toLocaleLowerCase("pt-BR"))
    ) {
      return false
    }
    if (params.situacao === "abertos" && p.finalizado === true) return false
    if (params.situacao === "finalizados" && p.finalizado !== true) return false
    return true
  })

  const paginacao = lerPaginacao(brutos, 30)
  const paginaAtual = paginar(filtrados, paginacao)

  return (
    <>
      <form method="GET" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="aba" value="periodos" />
        <Input
          name="busca"
          defaultValue={params.busca}
          placeholder="Nome do funcionário"
          className="h-9 w-full sm:max-w-56"
          aria-label="Buscar por funcionário"
        />
        <select
          name="situacao"
          defaultValue={params.situacao}
          aria-label="Filtrar por situação"
          className={SELECT_FILTRO}
        >
          <option value="todos">Todas as situações</option>
          <option value="abertos">Em aberto</option>
          <option value="finalizados">Finalizados</option>
        </select>
        <Button type="submit" variant="secondary" size="sm">
          Filtrar
        </Button>
        <span className="text-muted-foreground text-xs">
          {filtrados.length} período{filtrados.length === 1 ? "" : "s"}
        </span>
      </form>

      <div className="overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Funcionário</TableHead>
                <TableHead>Aquisitivo</TableHead>
                <TableHead className="hidden md:table-cell">Concessivo</TableHead>
                <TableHead className="text-right">Direito</TableHead>
                <TableHead className="text-right">Gozados</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead className="hidden lg:table-cell">Abono</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginaAtual.total === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="h-40">
                    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                      <TreePalm className="size-6" />
                      <p className="text-sm">
                        Nenhum período de férias
                        {params.busca && <> para “{params.busca}”</>}.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {paginaAtual.linhas.map((p) => {
                const r = resumoPeriodo(p)
                return (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-56 font-medium">
                      {p.trabalhador_id ? (
                        <Link
                          href={`/painel/pessoal/ferias/funcionario/${p.trabalhador_id}`}
                          className="hover:underline"
                        >
                          <span className="block truncate">
                            {p.funcionarioNome ?? "(sem nome)"}
                          </span>
                        </Link>
                      ) : (
                        "(sem funcionário)"
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatarData(p.aquisitivo_inicio)} –{" "}
                      {formatarData(p.aquisitivo_termino)}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden whitespace-nowrap md:table-cell">
                      {formatarData(p.concessivo_inicio)} –{" "}
                      {formatarData(p.concessivo_termino)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.direito}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.gozados}
                      {p.gozos.length > 0 && (
                        <span className="text-muted-foreground ml-1 text-xs">
                          ({p.gozos.length} {p.gozos.length === 1 ? "gozo" : "gozos"})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{r.saldo}</TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {p.abono_pecuniario === true ? (
                        <Badge variant="outline" className="border-info/40 text-info-fg">
                          1/3 vendido
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.finalizado === true ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          Finalizado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-success/40 text-success-fg">
                          Em aberto
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" asChild className="h-7 px-2">
                        <Link href={`/painel/pessoal/ferias/${p.id}`}>Abrir</Link>
                      </Button>
                      {p.gozos.length === 0 && (
                        <ExcluirPeriodoBotao
                          periodoId={p.id}
                          voltarPara="/painel/pessoal/ferias?aba=periodos"
                          compacto
                        />
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      <Paginacao
        total={paginaAtual.total}
        pagina={paginaAtual.pagina}
        totalPaginas={paginaAtual.totalPaginas}
        porPagina={paginacao.porPagina}
        padrao={30}
      />
    </>
  )
}
