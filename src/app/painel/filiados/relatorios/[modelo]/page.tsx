import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Download, Search, X } from "lucide-react"

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
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { Paginacao } from "@/components/paginacao"
import { requirePermissao } from "@/lib/auth"
import {
  baseRelatorios,
  colunasDoPedido,
  ehModelo,
  filtrarRelatorio,
  FILTROS_FIXOS,
  valorDaColuna,
  type FiltrosRelatorio,
} from "@/lib/db/filiacao-relatorios"
import { CONDICOES_NA_FONTE, FILIACAO_CONDICOES, GRUPOS_CONDICAO, REGIMES_TRABALHO } from "@/lib/filiacao"
import {
  COLUNAS_RELATORIO,
  OPCOES_TERNARIAS,
  ORDENS_RELATORIO,
  ROTULO_MODELO,
} from "@/lib/filiacao-relatorios-constantes"
import { formatarDataHora } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"

import { BotaoImprimir } from "./botao-imprimir"

export const metadata: Metadata = { title: "Relatório de filiados — Confluir" }

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const POR_PAGINA = 50

type Params = FiltrosRelatorio & { pagina?: string; porPagina?: string; col?: string | string[] }

const CHAVES_FILTRO: (keyof FiltrosRelatorio)[] = [
  "busca",
  "situacao",
  "condicao",
  "sexo",
  "uf",
  "cidade",
  "lotacao",
  "fonte",
  "condicaoFonte",
  "regime",
  "carencia",
  "inadimplente",
  "ficha",
  "lgpd",
  "desconto",
  "vinculo",
  "filiacaoDe",
  "filiacaoAte",
  "idadeMin",
  "idadeMax",
  "ordem",
  "dir",
  "colunas",
]

/** Uma linha de filtro: rótulo + select nativo (GET). */
function Filtro({
  nome,
  rotulo,
  valor,
  opcoes,
}: {
  nome: string
  rotulo: string
  valor: string
  opcoes: readonly { valor: string; rotulo: string }[]
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`f-${nome}`}>{rotulo}</Label>
      <select id={`f-${nome}`} name={nome} defaultValue={valor} className={SELECT}>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </div>
  )
}

export default async function RelatorioPage({
  params,
  searchParams,
}: {
  params: Promise<{ modelo: string }>
  searchParams: Promise<Params>
}) {
  await requirePermissao("filiacao_gestao")
  const { modelo } = await params
  if (!ehModelo(modelo)) notFound()
  const brutos = await searchParams
  const personalizado = modelo === "personalizado"

  // Nos modelos fixos, os filtros que os definem não saem da URL.
  const { col, pagina: _p, porPagina: _pp, ...restantes } = brutos
  void _p
  void _pp
  // As colunas chegam como checkboxes "col" (uma por coluna) ou como "colunas" (CSV).
  const colunasPedidas = Array.isArray(col) ? col.join(",") : (col ?? restantes.colunas)
  const filtros: FiltrosRelatorio = { ...restantes, colunas: colunasPedidas, ...FILTROS_FIXOS[modelo] }
  const colunas = colunasDoPedido(modelo, filtros.colunas)
  const base = await baseRelatorios()
  const linhas = filtrarRelatorio(base, filtros)
  const pag = lerPaginacao({ pagina: brutos.pagina, porPagina: brutos.porPagina }, POR_PAGINA)
  const pagina = paginar(linhas, pag)

  const query = new URLSearchParams()
  for (const k of CHAVES_FILTRO) {
    const v = filtros[k]
    if (v) query.set(k, v)
  }
  query.set("colunas", colunas.join(","))
  const urlExportar = `/painel/filiados/relatorios/exportar?modelo=${modelo}&${query.toString()}`
  const filtroAtivo = CHAVES_FILTRO.some(
    (k) => brutos[k] && !(k in FILTROS_FIXOS[modelo]) && k !== "ordem" && k !== "dir" && k !== "colunas"
  )
  const rotulo = ROTULO_MODELO[modelo]
  const n = (v: number) => v.toLocaleString("pt-BR")

  return (
    <>
      <div className="print:hidden">
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/filiados/relatorios">
            <ArrowLeft />
            Relatórios
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{rotulo.titulo}</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {rotulo.descricao}
              {modelo === "carencia" || modelo === "plenos"
                ? ` · carência de voto de ${base.carenciaVotoDias} dias, contada da filiação mais recente`
                : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <a href={urlExportar}>
                <Download />
                Exportar CSV
              </a>
            </Button>
            <BotaoImprimir />
          </div>
        </div>
      </div>

      {/* Cabeçalho só da impressão */}
      <div className="hidden print:block">
        <h1 className="text-xl font-semibold">{rotulo.titulo}</h1>
        <p className="text-xs">
          {n(pagina.total)} filiado(s) · apurado em {formatarDataHora(base.geradoEm)}
        </p>
      </div>

      <Card className="print:hidden">
        <CardContent>
          <form method="get" className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="f-busca">Nome ou CPF</Label>
                <Input id="f-busca" name="busca" defaultValue={filtros.busca ?? ""} placeholder="Busca livre" />
              </div>
              <Filtro
                nome="ordem"
                rotulo="Ordenar por"
                valor={filtros.ordem ?? "nome"}
                opcoes={ORDENS_RELATORIO.map((o) => ({ valor: o.chave, rotulo: o.rotulo }))}
              />
              <Filtro
                nome="dir"
                rotulo="Direção"
                valor={filtros.dir ?? "asc"}
                opcoes={[
                  { valor: "asc", rotulo: "Crescente" },
                  { valor: "desc", rotulo: "Decrescente" },
                ]}
              />
            </div>

            {personalizado && (
              <GrupoColapsavel
                titulo="Filtros"
                descricao="Cadastro, vínculo, direitos e termos"
                aberto={filtroAtivo}
              >
                <div className="grid gap-3 pt-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Filtro
                    nome="situacao"
                    rotulo="Situação do cadastro"
                    valor={filtros.situacao ?? "ativas"}
                    opcoes={OPCOES_TERNARIAS.situacao}
                  />
                  <Filtro
                    nome="condicao"
                    rotulo="Condição sindical"
                    valor={filtros.condicao ?? "todas"}
                    opcoes={[
                      { valor: "todas", rotulo: "Todas" },
                      ...Object.entries(GRUPOS_CONDICAO).map(([k, g]) => ({ valor: k, rotulo: g.rotulo })),
                      ...FILIACAO_CONDICOES.map((c) => ({ valor: c, rotulo: c })),
                      { valor: "nenhuma", rotulo: "Sem condição" },
                    ]}
                  />
                  <Filtro
                    nome="sexo"
                    rotulo="Sexo"
                    valor={filtros.sexo ?? "todos"}
                    opcoes={[
                      { valor: "todos", rotulo: "Todos" },
                      { valor: "Masculino", rotulo: "Masculino" },
                      { valor: "Feminino", rotulo: "Feminino" },
                      { valor: "Outro", rotulo: "Outro" },
                      { valor: "nenhum", rotulo: "Não informado" },
                    ]}
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor="f-idadeMin">Idade de</Label>
                      <Input id="f-idadeMin" name="idadeMin" inputMode="numeric" defaultValue={filtros.idadeMin ?? ""} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="f-idadeMax">até</Label>
                      <Input id="f-idadeMax" name="idadeMax" inputMode="numeric" defaultValue={filtros.idadeMax ?? ""} />
                    </div>
                  </div>

                  <Filtro
                    nome="fonte"
                    rotulo="Fonte pagadora (vínculo corrente)"
                    valor={filtros.fonte ?? "todas"}
                    opcoes={[{ valor: "todas", rotulo: "Todas" }, ...base.fontes.map((f) => ({ valor: f.id, rotulo: f.nome }))]}
                  />
                  <Filtro
                    nome="condicaoFonte"
                    rotulo="Condição na fonte"
                    valor={filtros.condicaoFonte ?? "todas"}
                    opcoes={[{ valor: "todas", rotulo: "Todas" }, ...CONDICOES_NA_FONTE.map((c) => ({ valor: c, rotulo: c }))]}
                  />
                  <Filtro
                    nome="regime"
                    rotulo="Regime de trabalho"
                    valor={filtros.regime ?? "todos"}
                    opcoes={[{ valor: "todos", rotulo: "Todos" }, ...REGIMES_TRABALHO.map((r) => ({ valor: r, rotulo: r }))]}
                  />
                  <Filtro
                    nome="vinculo"
                    rotulo="Vínculo"
                    valor={filtros.vinculo ?? "todas"}
                    opcoes={OPCOES_TERNARIAS.vinculo}
                  />

                  <div className="grid gap-1.5">
                    <Label htmlFor="f-lotacao">Lotação contém</Label>
                    <Input id="f-lotacao" name="lotacao" defaultValue={filtros.lotacao ?? ""} />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="grid gap-1.5">
                      <Label htmlFor="f-filiacaoDe">Filiação de</Label>
                      <Input id="f-filiacaoDe" name="filiacaoDe" type="date" defaultValue={filtros.filiacaoDe ?? ""} className="[color-scheme:light] dark:[color-scheme:dark]" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="f-filiacaoAte">até</Label>
                      <Input id="f-filiacaoAte" name="filiacaoAte" type="date" defaultValue={filtros.filiacaoAte ?? ""} className="[color-scheme:light] dark:[color-scheme:dark]" />
                    </div>
                  </div>
                  <Filtro
                    nome="uf"
                    rotulo="UF"
                    valor={filtros.uf ?? "todas"}
                    opcoes={[{ valor: "todas", rotulo: "Todas" }, ...base.ufs.map((u) => ({ valor: u, rotulo: u }))]}
                  />
                  <div className="grid gap-1.5">
                    <Label htmlFor="f-cidade">Cidade contém</Label>
                    <Input id="f-cidade" name="cidade" defaultValue={filtros.cidade ?? ""} />
                  </div>

                  <Filtro nome="carencia" rotulo="Carência de voto" valor={filtros.carencia ?? "todas"} opcoes={OPCOES_TERNARIAS.carencia} />
                  <Filtro nome="inadimplente" rotulo="Inadimplência" valor={filtros.inadimplente ?? "todas"} opcoes={OPCOES_TERNARIAS.inadimplente} />
                  <Filtro nome="ficha" rotulo="Ficha de filiação" valor={filtros.ficha ?? "todas"} opcoes={OPCOES_TERNARIAS.ficha} />
                  <Filtro nome="lgpd" rotulo="Termo LGPD" valor={filtros.lgpd ?? "todas"} opcoes={OPCOES_TERNARIAS.lgpd} />
                  <Filtro nome="desconto" rotulo="Termo de desconto" valor={filtros.desconto ?? "todas"} opcoes={OPCOES_TERNARIAS.desconto} />
                </div>
              </GrupoColapsavel>
            )}

            {personalizado && (
              <GrupoColapsavel titulo="Colunas" descricao={`${colunas.length} selecionada(s)`}>
                <ul className="grid gap-1 pt-2 sm:grid-cols-2 lg:grid-cols-4">
                  {COLUNAS_RELATORIO.map((c) => (
                    <li key={c.chave}>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="col"
                          value={c.chave}
                          defaultChecked={colunas.includes(c.chave)}
                          className="accent-primary"
                        />
                        {c.rotulo}
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="text-muted-foreground mt-2 text-xs">
                  Marque as colunas e clique em Aplicar; sem nenhuma marcada, valem as padrão.
                </p>
              </GrupoColapsavel>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit">
                <Search />
                Aplicar
              </Button>
              {(filtroAtivo || brutos.busca || col) && (
                <Button type="button" variant="ghost" asChild>
                  <Link href={`/painel/filiados/relatorios/${modelo}`}>
                    <X />
                    Limpar
                  </Link>
                </Button>
              )}
              <span className="text-muted-foreground ml-auto text-sm tabular-nums">
                {n(pagina.total)} filiado(s)
              </span>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="print:border-0 print:shadow-none">
        <CardHeader className="print:hidden">
          <CardTitle className="text-base">{rotulo.titulo}</CardTitle>
          <CardDescription>
            {pagina.total === 0
              ? "Nenhum filiado neste recorte."
              : `Página ${pagina.pagina} de ${pagina.totalPaginas} · ${n(pagina.total)} filiado(s)`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pagina.linhas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Nenhum filiado neste recorte.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {colunas.map((c) => (
                      <TableHead key={c} className="whitespace-nowrap">
                        {COLUNAS_RELATORIO.find((x) => x.chave === c)?.rotulo}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagina.linhas.map((l) => (
                    <TableRow key={l.id}>
                      {colunas.map((c) => {
                        const valor = valorDaColuna(l, c)
                        if (c === "nome") {
                          return (
                            <TableCell key={c} className="max-w-64 truncate font-medium">
                              <Link href={`/painel/filiados/${l.id}`} className="hover:underline">
                                {valor || "—"}
                              </Link>
                            </TableCell>
                          )
                        }
                        if (c === "carencia") {
                          return (
                            <TableCell key={c}>
                              <Badge variant={l.carencia === "cumprida" ? "success" : l.carencia === "em_carencia" ? "warning" : "outline"}>
                                {valor}
                              </Badge>
                            </TableCell>
                          )
                        }
                        if (c === "inadimplencia") {
                          return (
                            <TableCell key={c}>
                              <Badge variant={l.inadimplente ? "warning" : "secondary"}>{valor}</Badge>
                            </TableCell>
                          )
                        }
                        return (
                          <TableCell
                            key={c}
                            className={`whitespace-nowrap ${["cpf", "matricula", "idade", "diasRestantes", "faltas", "matriculaFonte"].includes(c) ? "tabular-nums" : ""} ${["lotacao", "cargo", "remessasEmFalta", "email"].includes(c) ? "max-w-56 truncate" : ""}`}
                            title={valor.length > 40 ? valor : undefined}
                          >
                            {valor || "—"}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {pagina.totalPaginas > 1 && (
            <div className="mt-4 print:hidden">
              <Paginacao
                total={pagina.total}
                pagina={pagina.pagina}
                totalPaginas={pagina.totalPaginas}
                porPagina={pag.porPagina}
                padrao={POR_PAGINA}
              />
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs print:hidden">
        A impressão sai só com a página atual da tabela; o CSV traz todos os
        {" "}{n(pagina.total)}. Apuração guardada por 10 minutos; última em{" "}
        {formatarDataHora(base.geradoEm)}.
      </p>
    </>
  )
}
