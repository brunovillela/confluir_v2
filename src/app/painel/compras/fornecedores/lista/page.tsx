import type { Metadata } from "next"
import Link from "next/link"
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Search, Truck } from "lucide-react"

import { Paginacao } from "@/components/paginacao"
import { LembrarLista } from "@/components/voltar-lista"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { panoramaFornecedores } from "@/lib/db/fornecedores-indicadores"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { formatarCnpjCpf } from "@/lib/mascaras"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { cn } from "@/lib/utils"
import { podeEditarFornecedores, podeVerFinanceiroFornecedores } from "@/lib/fornecedores-acesso"
import { ExportarXlsx } from "@/components/exportar-xlsx"
import { filtrar, NATUREZAS, ORDENS, ordenar, PADRAO_POR_PAGINA, PROBLEMAS, SITUACOES, TRAVA, type Filtros, type Ordem } from "./filtros"

export const metadata: Metadata = { title: "Lista de fornecedores — Confluir" }

const SELECT =
  "border-input bg-background text-foreground h-9 max-w-56 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

function url(f: Filtros, mudar: Partial<Filtros>): string {
  const m = { ...f, ...mudar }
  const q = new URLSearchParams()
  if (m.busca) q.set("busca", m.busca)
  if (m.situacao !== "ativos") q.set("situacao", m.situacao)
  if (m.natureza !== "todas") q.set("natureza", m.natureza)
  if (m.problema !== "todos") q.set("problema", m.problema)
  if (m.ordem !== "nome") q.set("ordem", m.ordem)
  if (m.dir !== "asc") q.set("dir", m.dir)
  if (m.pagina > 1) q.set("pagina", String(m.pagina))
  if (m.porPagina !== PADRAO_POR_PAGINA) q.set("porPagina", String(m.porPagina))
  const s = q.toString()
  return `/painel/compras/fornecedores/lista${s ? `?${s}` : ""}`
}

function Ordenavel({ f, campo, children, className }: { f: Filtros; campo: Ordem; children: React.ReactNode; className?: string }) {
  const ativo = f.ordem === campo
  // Texto começa crescente; valores e datas começam do maior/mais recente.
  const inicial = campo === "nome" || campo === "documento" ? "asc" : "desc"
  const proxima = ativo ? (f.dir === "asc" ? "desc" : "asc") : inicial
  return (
    <TableHead className={className}>
      <Link
        href={url(f, { ordem: campo, dir: proxima, pagina: 1 })}
        className={cn("hover:text-foreground inline-flex items-center gap-1", ativo && "text-foreground font-medium")}
      >
        {children}
        {ativo && (f.dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />)}
      </Link>
    </TableHead>
  )
}

export default async function ListaFornecedoresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sessao = await requirePermissao("aquisicoes_fornecedores", [
    "aquisicoes_fornecedores_edicao",
    "aquisicoes_compras_edicao",
  ])
  const podeEditar = podeEditarFornecedores(sessao.permissoes)
  const verFinanceiro = podeVerFinanceiroFornecedores(sessao.permissoes)
  const sp = await searchParams
  const pag = lerPaginacao(sp, PADRAO_POR_PAGINA)
  const f: Filtros = {
    busca: (sp.busca ?? "").trim(),
    situacao: SITUACOES.some((x) => x.valor === sp.situacao) ? sp.situacao! : "ativos",
    natureza: NATUREZAS.some((x) => x.valor === sp.natureza) ? sp.natureza! : "todas",
    problema: PROBLEMAS.some((x) => x.valor === sp.problema) ? sp.problema! : "todos",
    ordem:
      (ORDENS as readonly string[]).includes(sp.ordem ?? "") && (verFinanceiro || (sp.ordem !== "pago12m" && sp.ordem !== "ultima"))
        ? (sp.ordem as Ordem)
        : "nome",
    dir: sp.dir === "desc" ? "desc" : "asc",
    pagina: pag.pagina,
    porPagina: pag.porPagina,
  }

  const todas = await panoramaFornecedores()
  const filtradas = ordenar(filtrar(todas, f), f)
  const { linhas, pagina, totalPaginas, total } = paginar(filtradas, pag)

  return (
    <>
      <LembrarLista chave="fornecedores" url={url(f, {})} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras/fornecedores">
            <ArrowLeft />
            Fornecedores
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Lista de fornecedores</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {total.toLocaleString("pt-BR")} de {todas.length.toLocaleString("pt-BR")} cadastro(s) — clique no
              título de uma coluna para ordenar
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ExportarXlsx href="/painel/compras/fornecedores/lista/exportar" />
          {podeEditar && (
            <Button asChild>
              <Link href="/painel/compras/fornecedores/novo">
                <Plus />
                Novo fornecedor
              </Link>
            </Button>
          )}
          </div>
        </div>
      </div>

      <form method="GET" action="/painel/compras/fornecedores/lista" className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input name="busca" defaultValue={f.busca} placeholder="Nome, razão social ou CPF/CNPJ" className="pl-8" aria-label="Buscar fornecedor" />
        </div>
        <select name="situacao" defaultValue={f.situacao} className={SELECT} aria-label="Situação">
          {SITUACOES.map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}
        </select>
        <select name="natureza" defaultValue={f.natureza} className={SELECT} aria-label="Natureza">
          {NATUREZAS.map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}
        </select>
        <select name="problema" defaultValue={f.problema} className={SELECT} aria-label="Problemas no cadastro">
          {PROBLEMAS.map((x) => <option key={x.valor} value={x.valor}>{x.rotulo}</option>)}
        </select>
        {f.ordem !== "nome" && <input type="hidden" name="ordem" value={f.ordem} />}
        {f.dir !== "asc" && <input type="hidden" name="dir" value={f.dir} />}
        <Button type="submit" variant="secondary">Filtrar</Button>
        {(f.busca || f.situacao !== "ativos" || f.natureza !== "todas" || f.problema !== "todos") && (
          <Button variant="ghost" asChild>
            <Link href="/painel/compras/fornecedores/lista">Limpar</Link>
          </Button>
        )}
      </form>

      {f.problema === "documento_duplicado" && total > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            <span>
              Cadastros com o mesmo CPF/CNPJ são, em geral, a mesma empresa registrada duas vezes
              (migração do Bubble, cadastro repetido).{" "}
              <Link href="/painel/compras/fornecedores/duplicados" className="font-medium underline">
                {podeEditar ? "Mesclar os duplicados" : "Ver os duplicados agrupados"}
              </Link>
              {podeEditar && " junta tudo num cadastro só: ordens, contratos e demais registros."}
            </span>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          {linhas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <Truck className="mx-auto mb-2 size-5" />
              Nenhum fornecedor encontrado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <Ordenavel f={f} campo="nome">Fornecedor</Ordenavel>
                  <Ordenavel f={f} campo="documento">CPF/CNPJ</Ordenavel>
                  {verFinanceiro && <Ordenavel f={f} campo="pago12m" className="text-right">Pago em 12 meses</Ordenavel>}
                  {verFinanceiro && <TableHead className="hidden text-right lg:table-cell">Em aberto</TableHead>}
                  {verFinanceiro && <Ordenavel f={f} campo="ultima" className="hidden md:table-cell">Última ordem</Ordenavel>}
                  <Ordenavel f={f} campo="cadastro" className="hidden xl:table-cell">Cadastro</Ordenavel>
                  <Ordenavel f={f} campo="problemas">Alertas do cadastro</Ordenavel>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((l) => {
                  const docRuim = l.problemas.some((p) => TRAVA.includes(p.codigo))
                  return (
                    <TableRow key={l.id} className={l.inativa ? "opacity-60" : undefined}>
                      <TableCell className="max-w-72">
                        <Link href={`/painel/compras/fornecedores/${l.id}`} className="text-primary font-medium hover:underline">
                          {l.nome}
                        </Link>
                        <span className="text-muted-foreground block truncate text-xs">
                          {[
                            l.nome_razao && l.nome_razao !== l.nome ? l.nome_razao : null,
                            l.pessoa_juridica ? "PJ" : "PF",
                            l.apoiada ? "entidade apoiada" : null,
                            l.inativa ? "inativo" : null,
                          ].filter(Boolean).join(" · ")}
                        </span>
                      </TableCell>
                      <TableCell className={cn("whitespace-nowrap tabular-nums", docRuim && "text-destructive font-medium")}>
                        {l.cnpj_cpf ? formatarCnpjCpf(l.cnpj_cpf) : "—"}
                      </TableCell>
                      {verFinanceiro && (
                        <TableCell className="text-right whitespace-nowrap tabular-nums">
                          {l.pago12m ? formatarMoeda(l.pago12m) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      )}
                      {verFinanceiro && (
                        <TableCell className="hidden text-right whitespace-nowrap tabular-nums lg:table-cell">
                          {l.emAberto ? formatarMoeda(l.emAberto) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      )}
                      {verFinanceiro && (
                        <TableCell className="hidden whitespace-nowrap md:table-cell">
                          {l.ultimaOrdem ? formatarData(l.ultimaOrdem) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                      )}
                      <TableCell className="hidden whitespace-nowrap xl:table-cell">
                        {l.created_at ? formatarData(l.created_at.slice(0, 10)) : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {l.bloqueado && <Badge variant="warning">Bloqueado</Badge>}
                          {l.problemas.map((p) => (
                            <Badge
                              key={p.codigo}
                              variant="outline"
                              title={p.detalhe}
                              className={p.gravidade === "alta" ? "border-destructive/50 text-destructive" : p.gravidade === "media" ? "border-warning/50 text-warning-fg" : "text-muted-foreground"}
                            >
                              {p.rotulo}
                            </Badge>
                          ))}
                          {!l.bloqueado && l.problemas.length === 0 && (
                            <span className="text-muted-foreground text-xs">Cadastro completo</span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
          <div className="mt-4">
            <Paginacao total={total} pagina={pagina} totalPaginas={totalPaginas} porPagina={pag.porPagina} padrao={PADRAO_POR_PAGINA} />
          </div>
        </CardContent>
      </Card>
    </>
  )
}
