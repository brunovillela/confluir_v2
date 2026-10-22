import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, TreePalm } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { AvatarPessoa } from "@/components/pessoa-nome"
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
import { linkDeOrdem } from "@/components/coluna-ordenavel"
import { TileIndicador } from "@/components/graficos/tile"
import { Paginacao } from "@/components/paginacao"
import { AbasLink } from "@/components/pessoal/abas-link"
import { FiltrosFuncionarios } from "@/components/pessoal/filtros-funcionarios"
import { TabelaFuncionarios } from "@/components/pessoal/tabela-funcionarios"
import { SelectNativo } from "@/components/ui/select-nativo"
import { LembrarLista } from "@/components/voltar-lista"
import { requirePermissao } from "@/lib/auth"
import { listarPeriodosFerias, resumoPeriodo, type PeriodoFerias } from "@/lib/db/ferias"
import { gozosSemAviso } from "@/lib/db/ferias-aviso"
import { fotosDosUsuarios } from "@/lib/db/fotos-usuarios"
import { departamentosDaLista, funcionariosDaArea, type FuncionarioArea } from "@/lib/db/pessoal-area"
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
import { filtrarFuncionarios, lerFiltrosArea, ordenarPor, paramsDosFiltros } from "@/lib/pessoal-area"
import { cn } from "@/lib/utils"

import { AutorizarGozoBotao } from "./[id]/gozo-itens"
import { AvisosPendentes } from "./avisos-pendentes"
import { DistribuicaoMensal } from "./distribuicao-mensal"
import { ExcluirPeriodoBotao } from "./excluir-periodo"
import { BadgeSituacao, DetalheSituacao } from "./situacao-ferias"

export const metadata: Metadata = { title: "Férias — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type ParamsLista = {
  aba?: string
  departamento?: string
  ordem?: string
  dir?: string
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

const ORDENS = ["nome", "situacao", "saldo", "proximas", "prazo"] as const

/**
 * Férias — nível 1 do padrão das áreas do Pessoal: indicadores, gozos a
 * autorizar (a fila) e as abas Funcionários (inicial), Distribuição por mês
 * e Períodos.
 */
export default async function FeriasPage({
  searchParams,
}: {
  searchParams: Promise<ParamsLista>
}) {
  await requirePermissao("pessoal_gestao")

  const brutos = await searchParams
  const { salvo, excluido } = brutos
  const aba = brutos.aba === "periodos" ? "periodos" : brutos.aba === "distribuicao" ? "distribuicao" : "funcionarios"
  const [periodos, todos] = await Promise.all([listarPeriodosFerias(), funcionariosDaArea()])

  const hoje = hojeSP()
  const porTrabalhador = new Map<string, PeriodoFerias[]>()
  for (const p of periodos) {
    if (!p.trabalhador_id) continue
    porTrabalhador.set(p.trabalhador_id, [...(porTrabalhador.get(p.trabalhador_id) ?? []), p])
  }
  const funcionarios = todos.map((f) => ({
    ...f,
    situacao: situacaoDoFuncionario(porTrabalhador.get(f.usuarioId) ?? [], hoje, f.admissao),
  }))
  const ativos = funcionarios.filter((f) => f.ativo)
  const contagem = (c: ChaveSituacao) => ativos.filter((f) => f.situacao.chave === c).length
  const saldoTotal = ativos.reduce((s, f) => s + f.situacao.saldo, 0)

  // Gozos aguardando autorização (de qualquer funcionário, ativos ou não).
  const pendentes = periodos
    .flatMap((p) =>
      p.gozos
        .filter(gozoAguardandoAutorizacao)
        .map((g) => ({ ...g, periodoId: p.id, nome: p.funcionarioNome ?? "(sem nome)", trabalhadorId: p.trabalhador_id }))
    )
    .sort((a, b) => (a.inicio ?? "").localeCompare(b.inicio ?? ""))
  const pendentesAtrasados = pendentes.filter((g) => g.inicio && g.inicio <= hoje).length
  const fotosPendentes = await fotosDosUsuarios(pendentes.map((g) => g.trabalhadorId))
  const urlEstado = (c: ChaveSituacao) => `/painel/pessoal/ferias?estado=${c}`
  const semAviso = (await gozosSemAviso()).length

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

      <AvisosPendentes quantidade={semAviso} />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <TileIndicador
          rotulo="Em férias hoje"
          valor={String(contagem("em_ferias"))}
          nota={`de ${ativos.length} funcionário(s) ativo(s)`}
          href={urlEstado("em_ferias")}
        />
        <TileIndicador
          rotulo="Aguardando autorização"
          valor={String(pendentes.length)}
          nota={
            pendentesAtrasados > 0
              ? `${pendentesAtrasados} já ${pendentesAtrasados === 1 ? "começou" : "começaram"} sem autorização`
              : "gozos pedidos"
          }
          href="#pendentes"
        />
        <TileIndicador
          rotulo="Prazo vencendo"
          valor={String(contagem("vencendo"))}
          nota={`concessivo com saldo em até ${DIAS_ALERTA_CONCESSIVO} dias`}
          href={urlEstado("vencendo")}
        />
        <TileIndicador
          rotulo="Períodos vencidos"
          valor={String(contagem("vencido"))}
          nota="concessivo encerrado com saldo"
          href={urlEstado("vencido")}
        />
        <TileIndicador rotulo="Dias a gozar" valor={String(saldoTotal)} nota="saldo dos períodos em aberto" />
      </section>

      {pendentes.length > 0 && (
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
                        <div className="flex min-w-0 items-center gap-2">
                          <AvatarPessoa nome={g.nome} fotoUrl={g.trabalhadorId ? fotosPendentes.get(g.trabalhadorId) : null} />
                          {g.trabalhadorId ? (
                            <Link
                              href={`/painel/pessoal/ferias/funcionario/${g.trabalhadorId}`}
                              className="block min-w-0 truncate hover:underline"
                            >
                              {g.nome}
                            </Link>
                          ) : (
                            <span className="truncate">{g.nome}</span>
                          )}
                        </div>
                        {g.abono_solicitado === true && (
                          <Badge variant="outline" className="border-info/40 text-info-fg mt-0.5">
                            Venda de 1/3
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell
                        className={cn("whitespace-nowrap", g.inicio && g.inicio <= hoje && "text-destructive font-medium")}
                      >
                        {formatarData(g.inicio)}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{formatarData(g.termino)}</TableCell>
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
                          <Link href={`/painel/pessoal/ferias/${g.periodoId}?de=area`}>Abrir</Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <AbasLink
        rotulo="Visões das férias"
        abas={[
          { href: "/painel/pessoal/ferias", rotulo: "Funcionários", ativo: aba === "funcionarios" },
          { href: "/painel/pessoal/ferias?aba=distribuicao", rotulo: "Distribuição por mês", ativo: aba === "distribuicao" },
          { href: "/painel/pessoal/ferias?aba=periodos", rotulo: "Períodos", ativo: aba === "periodos", contador: periodos.length },
        ]}
      />

      {aba === "periodos" ? (
        <ListaPeriodos periodos={periodos} brutos={brutos} />
      ) : aba === "distribuicao" ? (
        <Distribuicao periodos={periodos} brutos={brutos} hoje={hoje} />
      ) : (
        <AbaFuncionarios brutos={brutos} funcionarios={funcionarios} contagem={contagem} />
      )}
    </>
  )
}

// ── Funcionários ────────────────────────────────────────────────────────────

function AbaFuncionarios({
  brutos,
  funcionarios,
  contagem,
}: {
  brutos: ParamsLista
  funcionarios: (FuncionarioArea & { situacao: ReturnType<typeof situacaoDoFuncionario> })[]
  contagem: (c: ChaveSituacao) => number
}) {
  const sp = brutos as Record<string, string | undefined>
  const f = lerFiltrosArea(sp, ORDENS, { ordem: "situacao" })
  const estado = (ORDEM_SITUACAO as string[]).includes(brutos.estado ?? "") ? (brutos.estado as ChaveSituacao) : null
  const valor = (l: (typeof funcionarios)[number]) => {
    switch (f.ordem) {
      case "situacao":
        return ORDEM_SITUACAO.indexOf(l.situacao.chave)
      case "saldo":
        return l.situacao.saldo
      case "proximas":
        return l.situacao.proximoGozo?.inicio ?? null
      case "prazo":
        return l.situacao.prazo
      default:
        return l.nome
    }
  }
  const linhas = ordenarPor(
    filtrarFuncionarios(funcionarios, f).filter((l) => !estado || l.situacao.chave === estado),
    f.dir,
    valor
  )
  const paginacao = lerPaginacao(sp, 30)
  const pagina = paginar(linhas, paginacao)
  const params = paramsDosFiltros(f, { estado: estado ?? undefined })
  const urlAtual = `/painel/pessoal/ferias?${new URLSearchParams(
    Object.entries({ ...params, pagina: sp.pagina, porPagina: sp.porPagina }).filter((e): e is [string, string] => Boolean(e[1]))
  )}`

  return (
    <>
      <LembrarLista chave="ferias-funcionarios" url={urlAtual} />
      <FiltrosFuncionarios
        filtros={f}
        departamentos={departamentosDaLista(funcionarios)}
        extras={
          <SelectNativo name="estado" defaultValue={estado ?? ""} aria-label="Situação de férias" className="h-9 w-auto">
            <option value="">Todas as situações de férias</option>
            {ORDEM_SITUACAO.map((c) => (
              <option key={c} value={c}>
                {ROTULO_SITUACAO[c]} ({contagem(c)})
              </option>
            ))}
          </SelectNativo>
        }
      />
      <TabelaFuncionarios
        pagina={pagina}
        ordem={f.ordem}
        dir={f.dir}
        porPagina={paginacao.porPagina}
        linkOrdem={linkDeOrdem("/painel/pessoal/ferias", params, f.ordem, f.dir)}
        hrefFuncionario={(l) => `/painel/pessoal/ferias/funcionario/${l.usuarioId}`}
        colunas={[
          {
            chave: "situacao",
            rotulo: "Situação",
            valor: (l) => (
              <>
                <BadgeSituacao chave={l.situacao.chave} />
                {l.situacao.detalhe && (
                  <span className="text-muted-foreground ml-1.5 text-xs whitespace-nowrap">
                    <DetalheSituacao situacao={l.situacao} />
                  </span>
                )}
              </>
            ),
          },
          { chave: "saldo", rotulo: "Saldo", className: "text-right tabular-nums", valor: (l) => l.situacao.saldo },
          {
            chave: "proximas",
            rotulo: "Próximas férias",
            className: "text-muted-foreground hidden whitespace-nowrap md:table-cell",
            valor: (l) =>
              l.situacao.proximoGozo ? (
                <>
                  {formatarData(l.situacao.proximoGozo.inicio)}
                  {!l.situacao.proximoGozo.autorizado && <span className="text-warning-fg ml-1 text-xs">(aguardando)</span>}
                </>
              ) : (
                "—"
              ),
          },
          {
            chave: "prazo",
            rotulo: "Prazo do concessivo",
            className: "text-muted-foreground hidden whitespace-nowrap lg:table-cell",
            valor: (l) => formatarData(l.situacao.prazo),
          },
        ]}
      />
    </>
  )
}

// ── Distribuição por mês ────────────────────────────────────────────────────

function Distribuicao({ periodos, brutos, hoje }: { periodos: PeriodoFerias[]; brutos: ParamsLista; hoje: string }) {
  const anoAtual = Number(hoje.slice(0, 4))
  const anos = anosComGozo(periodos, anoAtual)
  const ano = anos.includes(Number(brutos.ano)) ? Number(brutos.ano) : anoAtual
  const meses = distribuicaoPorMes(periodos, ano)
  const totalAno = meses.reduce((s, m) => s + m.autorizados + m.aguardando, 0)
  const urlAno = (a: number) => `/painel/pessoal/ferias?aba=distribuicao&ano=${a}`
  const idxAno = anos.indexOf(ano)

  return (
    <Card>
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
        <DistribuicaoMensal meses={meses} mesAtual={ano === anoAtual ? Number(hoje.slice(5, 7)) - 1 : null} />
      </CardContent>
    </Card>
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
                        <Link href={`/painel/pessoal/ferias/${p.id}?de=periodos`}>Abrir</Link>
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
