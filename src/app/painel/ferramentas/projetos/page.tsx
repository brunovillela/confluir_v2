import type { Metadata } from "next"
import Link from "next/link"
import { FolderKanban, Plus } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarProjetos, resumoProjetos } from "@/lib/db/projetos"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import {
  TIPOS_PROJETO,
  rotuloSituacaoProjeto,
  type SituacaoProjetoFiltro,
} from "@/lib/projetos-constantes"

export const metadata: Metadata = { title: "Projetos — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Params = { busca?: string; tipo?: string; situacao?: string }

function normalizarSituacao(v: string | undefined): SituacaoProjetoFiltro {
  return v === "finalizados" || v === "todos" ? v : "andamento"
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

  const [resumo, projetos] = await Promise.all([
    resumoProjetos(),
    listarProjetos({ busca, tipo, situacao }),
  ])

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projetos</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Projetos do sindicato, orçamento e gasto vinculado em Compras
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CardResumo rotulo="Projetos" valor={resumo.total} />
        <CardResumo rotulo="Em andamento" valor={resumo.emAndamento} />
        <CardResumo
          rotulo="Orçamento em andamento"
          valor={formatarMoeda(resumo.orcamentoAndamento)}
        />
        <CardResumo
          rotulo="Solicitado em Compras"
          valor={formatarMoeda(resumo.solicitadoCompras)}
        />
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
        <select name="tipo" defaultValue={tipo} className={SELECT_FILTRO}>
          <option value="">Todos os tipos</option>
          {TIPOS_PROJETO.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select name="situacao" defaultValue={situacao} className={SELECT_FILTRO}>
          <option value="andamento">Em andamento</option>
          <option value="finalizados">Finalizados</option>
          <option value="todos">Todos</option>
        </select>
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
                  <TableHead>Tipo</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead className="text-right">Orçamento</TableHead>
                  <TableHead className="text-right">Solicitado</TableHead>
                  <TableHead>Situação</TableHead>
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
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {p.tipo ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {p.inicio ? formatarData(p.inicio) : "—"}
                      {p.termino_previsao
                        ? ` – ${formatarData(p.termino_previsao)}`
                        : ""}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {p.orcamento != null ? formatarMoeda(p.orcamento) : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {p.solicitacoes > 0 ? (
                        <span title={`${p.solicitacoes} solicitação(ões)`}>
                          {formatarMoeda(p.gastoCompras)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      {p.finalizado ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          Finalizado
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-success/40 text-success-fg">
                          {rotuloSituacaoProjeto(false)}
                        </Badge>
                      )}
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
}: {
  rotulo: string
  valor: number | string
}) {
  return (
    <Card>
      <CardContent>
        <p className="text-muted-foreground text-xs">{rotulo}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {typeof valor === "number" ? valor.toLocaleString("pt-BR") : valor}
        </p>
      </CardContent>
    </Card>
  )
}
