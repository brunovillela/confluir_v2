import type { Metadata } from "next"
import Link from "next/link"
import { FolderKanban, Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarProjetos, resumoProjetos, type ProjetoLinha } from "@/lib/db/projetos"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import {
  ORDEM_NIVEL_PROJETO,
  TIPOS_PROJETO,
  type NivelProjeto,
  type SituacaoProjetoFiltro,
} from "@/lib/projetos-constantes"

import { SeloSituacaoProjeto } from "./selo-situacao"

export const metadata: Metadata = { title: "Projetos — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Params = { busca?: string; tipo?: string; situacao?: string; saude?: string; estrategicos?: string }

const SAUDES = ["atrasado", "atencao", "no_prazo"] as const
type Saude = (typeof SAUDES)[number]

function normalizarSituacao(v: string | undefined): SituacaoProjetoFiltro {
  return v === "finalizados" || v === "todos" ? v : "andamento"
}

/** Carteira: o que pede ação primeiro; dentro do nível, os estratégicos. */
function ordenarCarteira(lista: ProjetoLinha[]): ProjetoLinha[] {
  return [...lista].sort(
    (a, b) =>
      ORDEM_NIVEL_PROJETO[a.situacao.nivel] - ORDEM_NIVEL_PROJETO[b.situacao.nivel] ||
      Number(b.estrategico === true) - Number(a.estrategico === true)
  )
}

export default async function ProjetosPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const sessao = await requirePermissao("ferramentas_projetos", [
    "ferramentas_projetos_edicao",
  ])
  const editor = podeAcessar(sessao.permissoes, "ferramentas_projetos_edicao")

  const brutos = await searchParams
  const busca = (brutos.busca ?? "").trim()
  const tipo = (TIPOS_PROJETO as readonly string[]).includes(brutos.tipo ?? "")
    ? brutos.tipo
    : ""
  const situacao = normalizarSituacao(brutos.situacao)
  const saude: Saude | "" = (SAUDES as readonly string[]).includes(brutos.saude ?? "") ? (brutos.saude as Saude) : ""
  const soEstrategicos = brutos.estrategicos === "1"

  const filtrosPadrao = !busca && !tipo && situacao === "andamento"
  const [resumo, filtrados, emAndamentoBruto] = await Promise.all([
    resumoProjetos(),
    listarProjetos({ busca, tipo, situacao }),
    // Os números da carteira olham só os projetos em andamento.
    filtrosPadrao ? Promise.resolve(null) : listarProjetos({ situacao: "andamento" }),
  ])
  const emAndamento = emAndamentoBruto ?? filtrados
  const contar = (n: NivelProjeto) => emAndamento.filter((p) => p.situacao.nivel === n).length
  const projetos = ordenarCarteira(
    filtrados.filter(
      (p) => (!saude || p.situacao.nivel === saude) && (!soEstrategicos || p.estrategico === true)
    )
  )
  const linkSaude = (n: Saude) => `/painel/ferramentas/projetos?saude=${n}`

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projetos</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            A carteira de projetos: prazo pelos marcos e tarefas, orçamento contra o solicitado em Aquisição
          </p>
        </div>
        {editor && (
          <Button asChild>
            <Link href="/painel/ferramentas/projetos/novo">
              <Plus />
              Novo projeto
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <CardResumo rotulo="Em andamento" valor={resumo.emAndamento} />
        <CardResumo
          rotulo="Estratégicos"
          valor={emAndamento.filter((p) => p.estrategico === true).length}
          href="/painel/ferramentas/projetos?estrategicos=1"
        />
        <CardResumo rotulo="Atrasados" valor={contar("atrasado")} href={linkSaude("atrasado")} tom="perigo" />
        <CardResumo rotulo="Precisam de atenção" valor={contar("atencao")} href={linkSaude("atencao")} tom="alerta" />
        <CardResumo rotulo="Orçamento em andamento" valor={formatarMoeda(resumo.orcamentoAndamento)} />
        <CardResumo rotulo="Gasto em andamento" valor={formatarMoeda(resumo.gastoAndamento)} />
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        action="/painel/ferramentas/projetos"
      >
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Título do projeto"
          className={`${SELECT_FILTRO} w-64 max-w-full`}
        />
        <select name="tipo" defaultValue={tipo} className={SELECT_FILTRO} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          {TIPOS_PROJETO.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select name="situacao" defaultValue={situacao} className={SELECT_FILTRO} aria-label="Andamento">
          <option value="andamento">Em andamento</option>
          <option value="finalizados">Finalizados</option>
          <option value="todos">Todos</option>
        </select>
        <select name="saude" defaultValue={saude} className={SELECT_FILTRO} aria-label="Situação">
          <option value="">Qualquer situação</option>
          <option value="atrasado">Atrasados</option>
          <option value="atencao">Precisam de atenção</option>
          <option value="no_prazo">No prazo</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="estrategicos" value="1" defaultChecked={soEstrategicos} className="size-4" />
          Só estratégicos
        </label>
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

      <Card>
        <CardContent>
          {projetos.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <FolderKanban className="mx-auto mb-2 size-5" />
              Nenhum projeto encontrado com estes filtros.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Projeto</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Tarefas</TableHead>
                  <TableHead>Próximo marco</TableHead>
                  <TableHead className="text-right">Orçamento</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projetos.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="max-w-80">
                      <Link
                        href={`/painel/ferramentas/projetos/${p.id}`}
                        className="text-primary font-medium hover:underline"
                      >
                        <span className="line-clamp-1">
                          {p.titulo ?? "(sem título)"}
                        </span>
                      </Link>
                      <span className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
                        {p.estrategico && <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">Estratégico</Badge>}
                        {p.tipo ?? "—"}
                        {p.termino_previsao ? ` · até ${formatarData(p.termino_previsao)}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-64">
                      <SeloSituacaoProjeto nivel={p.situacao.nivel} motivos={p.situacao.motivos} />
                      {p.situacao.motivos[0] && (
                        <span className="text-muted-foreground mt-0.5 line-clamp-1 text-xs" title={p.situacao.motivos.join(" · ")}>
                          {p.situacao.motivos[0]}
                          {p.situacao.motivos.length > 1 ? ` (+${p.situacao.motivos.length - 1})` : ""}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-32">
                      {p.tarefas.total > 0 ? (
                        <div className="grid gap-1">
                          <Progress
                            value={(p.tarefas.concluidas / p.tarefas.total) * 100}
                            className="h-1.5"
                            aria-label="Tarefas concluídas"
                          />
                          <span className="text-muted-foreground text-xs tabular-nums">
                            {p.tarefas.concluidas}/{p.tarefas.total}
                            {p.tarefas.atrasadas > 0 && (
                              <span className="text-destructive"> · {p.tarefas.atrasadas} atrasada{p.tarefas.atrasadas === 1 ? "" : "s"}</span>
                            )}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-56 text-sm">
                      {p.proximoMarco ? (
                        <>
                          <span className="line-clamp-1">{p.proximoMarco.titulo}</span>
                          <span className="text-muted-foreground text-xs tabular-nums">
                            {formatarData(p.proximoMarco.dataPrevista)} · {p.marcos.concluidos}/{p.marcos.total} cumpridos
                          </span>
                        </>
                      ) : p.marcos.total > 0 ? (
                        <span className="text-muted-foreground text-xs">Todos os {p.marcos.total} cumpridos</span>
                      ) : (
                        <span className="text-muted-foreground text-xs">Sem marcos</span>
                      )}
                    </TableCell>
                    <TableCell className="min-w-36 text-right">
                      <span className="tabular-nums whitespace-nowrap">
                        {p.orcamento != null ? formatarMoeda(p.orcamento) : "—"}
                      </span>
                      {p.orcamento != null && p.orcamento > 0 ? (
                        <div className="mt-1 grid gap-0.5">
                          <Progress
                            value={Math.min((p.gasto.total / p.orcamento) * 100, 100)}
                            className={`h-1.5 ${p.gasto.total > p.orcamento ? "[&>[data-slot=progress-indicator]]:bg-destructive" : ""}`}
                            aria-label="Parte do orçamento gasta"
                          />
                          <span className={`text-xs tabular-nums ${p.gasto.total > p.orcamento ? "text-destructive" : "text-muted-foreground"}`}>
                            {formatarMoeda(p.gasto.total)} gasto
                          </span>
                        </div>
                      ) : p.gasto.total > 0 ? (
                        <span className="text-muted-foreground block text-xs tabular-nums">{formatarMoeda(p.gasto.total)} gasto</span>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function CardResumo({
  rotulo,
  valor,
  href,
  tom,
}: {
  rotulo: string
  valor: number | string
  href?: string
  tom?: "perigo" | "alerta"
}) {
  const cor = typeof valor === "number" && valor > 0 ? (tom === "perigo" ? "text-destructive" : tom === "alerta" ? "text-warning-fg" : "") : ""
  const conteudo = (
    <Card className={href ? "hover:border-primary/40 h-full transition-colors" : "h-full"}>
      <CardContent>
        <p className="text-muted-foreground text-xs">{rotulo}</p>
        <p className={`mt-1 text-2xl font-semibold tabular-nums ${cor}`}>
          {typeof valor === "number" ? valor.toLocaleString("pt-BR") : valor}
        </p>
      </CardContent>
    </Card>
  )
  return href ? <Link href={href}>{conteudo}</Link> : conteudo
}
