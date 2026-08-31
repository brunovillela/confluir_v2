import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, FileText, Plus, ScrollText, Tags } from "lucide-react"

import {
  TiposContratoBadges,
  VigenciaContratoBadge,
} from "@/components/compras"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { Paginacao } from "@/components/paginacao"
import { requirePermissao } from "@/lib/auth"
import {
  ROTULOS_SITUACAO_CONTRATO,
  SITUACOES_CONTRATO,
  TIPOS_CONTRATO_MARCAVEIS,
  type SituacaoContrato,
} from "@/lib/contratos-constantes"
import {
  listarCategoriasContrato,
  listarContratos,
  resumoContratos,
} from "@/lib/db/contratos"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Contratos — Confluir" }

const FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Params = {
  busca?: string
  situacao?: string
  tipo?: string
  categoria?: string
  pagina?: string
  porPagina?: string
  excluido?: string
}

export default async function ContratosPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const sessao = await requirePermissao("aquisicoes_contratos", [
    "aquisicoes_contratos_edicao",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "aquisicoes_contratos_edicao")

  const brutos = await searchParams
  const situacao = (SITUACOES_CONTRATO as readonly string[]).includes(
    brutos.situacao ?? ""
  )
    ? (brutos.situacao as SituacaoContrato)
    : "todos"
  const tipo = TIPOS_CONTRATO_MARCAVEIS.some((t) => t.chave === brutos.tipo)
    ? (brutos.tipo as string)
    : ""
  const busca = (brutos.busca ?? "").trim()

  // Categorias visíveis: quem não edita não vê as sigilosas (nem no filtro).
  const todasCategorias = await listarCategoriasContrato()
  const categoriasVisiveis = podeEditar
    ? todasCategorias
    : todasCategorias.filter((c) => !c.sigiloso)
  const categoria = categoriasVisiveis.some((c) => c.id === brutos.categoria)
    ? (brutos.categoria as string)
    : ""

  const [resumo, contratos] = await Promise.all([
    resumoContratos(podeEditar, false),
    listarContratos({
      busca,
      situacao,
      tipo,
      categoriaId: categoria || undefined,
      verSigilosos: podeEditar,
      apoioInstitucional: false,
    }),
  ])

  const paginacao = lerPaginacao(brutos, 30)
  const { linhas, pagina, totalPaginas, total } = paginar(contratos, paginacao)

  const filtroHref = (mud: Record<string, string>) => {
    const q = new URLSearchParams()
    const estado: Record<string, string> = {
      busca,
      situacao,
      tipo,
      categoria,
      ...mud,
    }
    for (const [k, v] of Object.entries(estado)) {
      if (v && v !== "todos") q.set(k, v)
    }
    const s = q.toString()
    return `/painel/compras/contratos${s ? `?${s}` : ""}`
  }

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras">
            <ArrowLeft />
            Compras
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Contratos</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Contratos com fornecedores, aditivos e acompanhamento de vigência
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/painel/compras/contratos/rpa">
                <ScrollText />
                RPA
              </Link>
            </Button>
            {podeEditar && (
              <>
                <Button variant="outline" asChild>
                  <Link href="/painel/compras/contratos/categorias">
                    <Tags />
                    Categorias
                  </Link>
                </Button>
                <Button asChild>
                  <Link href="/painel/compras/contratos/novo">
                    <Plus />
                    Novo contrato
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      {brutos.excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Contrato excluído.</AlertDescription>
        </Alert>
      )}

      {!resumo.esquemaCompleto && (
        <Alert variant="warning">
          <AlertDescription>
            Módulo de contratos ainda não configurado por completo — rode{" "}
            <code>supabase/contratos.sql</code> no SQL Editor do Supabase para
            habilitar o valor do contrato e os índices.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CardResumo
          rotulo="Vigentes"
          valor={resumo.vigentes}
          href={filtroHref({ situacao: "vigentes", pagina: "" })}
        />
        <CardResumo
          rotulo="Vencendo (≤30 dias)"
          valor={resumo.vencendo}
          href={filtroHref({ situacao: "vencendo", pagina: "" })}
        />
        <CardResumo
          rotulo="Vencidos"
          valor={resumo.vencidos}
          href={filtroHref({ situacao: "vencidos", pagina: "" })}
        />
        <CardResumo
          rotulo="Sem termo definido"
          valor={resumo.semTermo}
          href={filtroHref({ situacao: "sem_termo", pagina: "" })}
        />
      </div>

      <form action="/painel/compras/contratos" className="flex flex-wrap gap-2">
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Código, objeto ou fornecedor"
          className={`${FILTRO} w-64 max-w-full`}
        />
        <select name="situacao" defaultValue={situacao} className={FILTRO}>
          {SITUACOES_CONTRATO.map((s) => (
            <option key={s} value={s}>
              {ROTULOS_SITUACAO_CONTRATO[s]}
            </option>
          ))}
        </select>
        <select name="tipo" defaultValue={tipo} className={FILTRO}>
          <option value="">Todos os tipos</option>
          {TIPOS_CONTRATO_MARCAVEIS.map((t) => (
            <option key={t.chave} value={t.chave}>
              {t.rotulo}
            </option>
          ))}
        </select>
        {categoriasVisiveis.length > 0 && (
          <select name="categoria" defaultValue={categoria} className={FILTRO}>
            <option value="">Todas as categorias</option>
            {categoriasVisiveis.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome ?? "(sem nome)"}
                {c.sigiloso ? " (sigilosa)" : ""}
              </option>
            ))}
          </select>
        )}
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

      <Card>
        <CardContent>
          {linhas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <ScrollText className="mx-auto mb-2 size-5" />
              Nenhum contrato encontrado com estes filtros.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Objeto</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Vigência</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-center">PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/painel/compras/contratos/${c.id}`}
                        className="text-primary font-medium whitespace-nowrap tabular-nums hover:underline"
                      >
                        {c.codigo ?? "(sem código)"}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-72">
                      <span className="line-clamp-2">{c.objeto ?? "—"}</span>
                    </TableCell>
                    <TableCell className="max-w-48">
                      <span className="line-clamp-2">
                        {c.fornecedorNome ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatarMoeda(c.valor)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {c.vigencia_termino
                        ? formatarData(c.vigencia_termino)
                        : "sem termo"}
                    </TableCell>
                    <TableCell>
                      <VigenciaContratoBadge vigencia={c.vigencia} />
                    </TableCell>
                    <TableCell className="max-w-40">
                      {c.categoriaNome ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="line-clamp-1">{c.categoriaNome}</span>
                          {c.categoriaSigiloso && (
                            <Badge
                              variant="outline"
                              className="border-warning/40 text-warning-fg shrink-0"
                            >
                              Sigilosa
                            </Badge>
                          )}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <TiposContratoBadges
                        aditivo={c.aditivo}
                        sob_demanda={c.sob_demanda}
                        apoio_institucional={c.apoio_institucional}
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      {c.arquivo_contrato ? (
                        <FileText className="text-muted-foreground mx-auto size-4" />
                      ) : (
                        "—"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="mt-4">
            <Paginacao
              total={total}
              pagina={pagina}
              totalPaginas={totalPaginas}
              porPagina={paginacao.porPagina}
              padrao={30}
            />
          </div>
        </CardContent>
      </Card>
    </>
  )
}

function CardResumo({
  rotulo,
  valor,
  href,
}: {
  rotulo: string
  valor: number
  href: string
}) {
  return (
    <Link href={href} className="group">
      <Card className="group-hover:border-primary/40 transition-colors">
        <CardContent>
          <p className="text-muted-foreground text-xs">{rotulo}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">
            {valor.toLocaleString("pt-BR")}
          </p>
        </CardContent>
      </Card>
    </Link>
  )
}
