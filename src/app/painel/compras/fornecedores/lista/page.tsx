import type { Metadata } from "next"
import Link from "next/link"
import { ArrowDown, ArrowLeft, ArrowUp, Plus, Search, Truck } from "lucide-react"

import { Paginacao } from "@/components/paginacao"
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
import {
  ehProblema,
  panoramaFornecedores,
  ROTULO_PROBLEMA,
  type CodigoProblema,
  type LinhaFornecedor,
} from "@/lib/db/fornecedores-indicadores"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { formatarCnpjCpf } from "@/lib/mascaras"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Lista de fornecedores — Confluir" }

const SELECT =
  "border-input bg-background text-foreground h-9 max-w-56 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const ORDENS = ["nome", "documento", "pago12m", "ultima", "cadastro", "problemas"] as const
type Ordem = (typeof ORDENS)[number]
const SITUACOES = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "bloqueados", rotulo: "Bloqueados" },
  { valor: "inativos", rotulo: "Inativos" },
  { valor: "todos", rotulo: "Todos" },
] as const
const NATUREZAS = [
  { valor: "todas", rotulo: "Todas as naturezas" },
  { valor: "pj", rotulo: "Pessoa jurídica" },
  { valor: "pf", rotulo: "Pessoa física" },
  { valor: "apoiada", rotulo: "Entidade apoiada" },
] as const
const PROBLEMAS = [
  { valor: "todos", rotulo: "Com ou sem problema" },
  { valor: "com", rotulo: "Com algum problema" },
  { valor: "trava", rotulo: "CPF/CNPJ que trava pagamento" },
  ...(Object.entries(ROTULO_PROBLEMA) as [CodigoProblema, string][]).map(([valor, rotulo]) => ({ valor, rotulo })),
] as const

type Filtros = {
  busca: string
  situacao: string
  natureza: string
  problema: string
  ordem: Ordem
  dir: "asc" | "desc"
  pagina: number
  porPagina: number
}
const PADRAO_POR_PAGINA = 30

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

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
const TRAVA: CodigoProblema[] = ["sem_documento", "documento_invalido"]

function filtrar(linhas: LinhaFornecedor[], f: Filtros): LinhaFornecedor[] {
  const termo = semAcento(f.busca.trim())
  const dig = f.busca.replace(/\D/g, "")
  return linhas.filter((l) => {
    if (f.situacao === "ativos" && l.inativa) return false
    if (f.situacao === "inativos" && !l.inativa) return false
    if (f.situacao === "bloqueados" && (!l.bloqueado || l.inativa)) return false
    if (f.natureza === "pj" && !l.pessoa_juridica) return false
    if (f.natureza === "pf" && l.pessoa_juridica) return false
    if (f.natureza === "apoiada" && !l.apoiada) return false
    if (f.problema === "com" && !l.problemas.some(ehProblema)) return false
    if (f.problema === "trava" && !l.problemas.some((p) => TRAVA.includes(p.codigo))) return false
    if (f.problema in ROTULO_PROBLEMA && !l.problemas.some((p) => p.codigo === f.problema)) return false
    if (termo) {
      const alvo = semAcento(`${l.nome} ${l.nome_razao ?? ""}`)
      if (!alvo.includes(termo) && !(dig.length >= 3 && (l.cnpj_cpf ?? "").replace(/\D/g, "").includes(dig))) return false
    }
    return true
  })
}

function ordenar(linhas: LinhaFornecedor[], f: Filtros): LinhaFornecedor[] {
  const s = f.dir === "asc" ? 1 : -1
  const chave = (l: LinhaFornecedor): string | number => {
    switch (f.ordem) {
      case "documento": return (l.cnpj_cpf ?? "").replace(/\D/g, "") || "~"
      case "pago12m": return l.pago12m
      case "ultima": return l.ultimaOrdem ?? ""
      case "cadastro": return l.created_at ?? ""
      case "problemas": return l.problemas.filter((p) => p.gravidade === "alta").length * 100 + l.problemas.filter(ehProblema).length * 10 + l.problemas.length
      default: return semAcento(l.nome)
    }
  }
  return [...linhas].sort((a, b) => {
    const x = chave(a), y = chave(b)
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR")
    return c * s || semAcento(a.nome).localeCompare(semAcento(b.nome), "pt-BR")
  })
}

export default async function ListaFornecedoresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermissao("aquisicoes_fornecedores", ["aquisicoes_compras_edicao"])
  const sp = await searchParams
  const pag = lerPaginacao(sp, PADRAO_POR_PAGINA)
  const f: Filtros = {
    busca: (sp.busca ?? "").trim(),
    situacao: SITUACOES.some((x) => x.valor === sp.situacao) ? sp.situacao! : "ativos",
    natureza: NATUREZAS.some((x) => x.valor === sp.natureza) ? sp.natureza! : "todas",
    problema: PROBLEMAS.some((x) => x.valor === sp.problema) ? sp.problema! : "todos",
    ordem: (ORDENS as readonly string[]).includes(sp.ordem ?? "") ? (sp.ordem as Ordem) : "nome",
    dir: sp.dir === "desc" ? "desc" : "asc",
    pagina: pag.pagina,
    porPagina: pag.porPagina,
  }

  const todas = await panoramaFornecedores()
  const filtradas = ordenar(filtrar(todas, f), f)
  const { linhas, pagina, totalPaginas, total } = paginar(filtradas, pag)

  return (
    <>
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
          <Button asChild>
            <Link href="/painel/compras/fornecedores/novo">
              <Plus />
              Novo fornecedor
            </Link>
          </Button>
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
                  <Ordenavel f={f} campo="pago12m" className="text-right">Pago em 12 meses</Ordenavel>
                  <TableHead className="hidden text-right lg:table-cell">Em aberto</TableHead>
                  <Ordenavel f={f} campo="ultima" className="hidden md:table-cell">Última ordem</Ordenavel>
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
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {l.pago12m ? formatarMoeda(l.pago12m) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="hidden text-right whitespace-nowrap tabular-nums lg:table-cell">
                        {l.emAberto ? formatarMoeda(l.emAberto) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap md:table-cell">
                        {l.ultimaOrdem ? formatarData(l.ultimaOrdem) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
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
