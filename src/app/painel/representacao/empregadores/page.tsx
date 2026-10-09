import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  Building2,
  Plus,
  Search,
  Tags,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Paginacao } from "@/components/paginacao"
import { LembrarLista } from "@/components/voltar-lista"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarCategoriasFonte } from "@/lib/db/fonte-categorias"
import { listarFontesPagadoras, type FontePagadora } from "@/lib/db/fontes"
import { formatarCnpjCpf } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { podeAcessar } from "@/lib/permissoes"
import {
  type CategoriaFonte,
  chaveCategoriaDaFonte,
  nomeCategoriaDaFonte,
} from "@/lib/saude-cadastros"
import { semAcento } from "@/lib/texto"

export const metadata: Metadata = { title: "Empregadores — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const BASE = "/painel/representacao/empregadores"
const POR_PAGINA_PADRAO = 30

const ORDENS = ["nome", "cnpj", "categoria", "filiados", "situacao"] as const
type Ordem = (typeof ORDENS)[number]

type Filtros = {
  busca: string
  tipo: string
  situacao: string
  ordem: Ordem
  asc: boolean
  porPagina: number
}

/** URL da lista com os filtros (e mudanças); omite o que está no padrão. */
function url(f: Filtros, mudancas: Partial<Filtros> & { pagina?: number }): string {
  const v = { ...f, ...mudancas }
  const q = new URLSearchParams()
  if (v.busca) q.set("busca", v.busca)
  if (v.tipo !== "todos") q.set("tipo", v.tipo)
  if (v.situacao !== "todas") q.set("situacao", v.situacao)
  if (v.ordem !== "filiados") q.set("ordem", v.ordem)
  if (v.asc !== (v.ordem !== "filiados")) q.set("dir", v.asc ? "asc" : "desc")
  if (v.porPagina !== POR_PAGINA_PADRAO) q.set("porPagina", String(v.porPagina))
  if (mudancas.pagina && mudancas.pagina > 1) q.set("pagina", String(mudancas.pagina))
  const s = q.toString()
  return s ? `${BASE}?${s}` : BASE
}

const nomeDa = (f: FontePagadora) => f.nome_fantasia ?? f.nome_razao ?? ""

function ordenar(
  fontes: FontePagadora[],
  f: Filtros,
  categorias: CategoriaFonte[]
): FontePagadora[] {
  const porNome = (a: FontePagadora, b: FontePagadora) =>
    nomeDa(a).localeCompare(nomeDa(b), "pt-BR")
  const chave: Record<Ordem, (a: FontePagadora, b: FontePagadora) => number> = {
    nome: porNome,
    cnpj: (a, b) => (a.cnpj_cpf ?? "").localeCompare(b.cnpj_cpf ?? ""),
    categoria: (a, b) =>
      nomeCategoriaDaFonte(a, categorias).localeCompare(
        nomeCategoriaDaFonte(b, categorias),
        "pt-BR"
      ),
    filiados: (a, b) => a.filiadosAtivos - b.filiadosAtivos,
    situacao: (a, b) => Number(a.inativa === true) - Number(b.inativa === true),
  }
  const sinal = f.asc ? 1 : -1
  // Empate cai no nome, sempre em ordem alfabética.
  return [...fontes].sort((a, b) => sinal * chave[f.ordem](a, b) || porNome(a, b))
}

export default async function FontesPage({
  searchParams,
}: {
  searchParams: Promise<{
    salvo?: string
    excluida?: string
    tipo?: string
    situacao?: string
    busca?: string
    ordem?: string
    dir?: string
    pagina?: string
    porPagina?: string
  }>
}) {
  const sessao = await requirePermissao("empregadores")
  const podeEditar = podeAcessar(sessao.permissoes, "empregadores")

  const params = await searchParams
  const { salvo, excluida } = params
  const situacao = ["ativas", "inativas"].includes(params.situacao ?? "")
    ? (params.situacao as string)
    : "todas"

  const [todasFontes, categorias] = await Promise.all([
    listarFontesPagadoras(),
    listarCategoriasFonte(),
  ])
  // "fundo" é o valor antigo do filtro (links salvos).
  const tipoBruto = params.tipo === "fundo" ? "fundo_pensao" : params.tipo
  const tipo = categorias.some((c) => c.chave === tipoBruto) ? (tipoBruto as string) : "todos"
  const ordem: Ordem = (ORDENS as readonly string[]).includes(params.ordem ?? "")
    ? (params.ordem as Ordem)
    : "filiados"
  const pag = lerPaginacao(params, POR_PAGINA_PADRAO)
  const filtros: Filtros = {
    busca: (params.busca ?? "").trim(),
    tipo,
    situacao,
    ordem,
    // Filiados começa do maior; as demais colunas, de A a Z.
    asc: params.dir ? params.dir === "asc" : ordem !== "filiados",
    porPagina: pag.porPagina,
  }

  // Busca sem acento pelo nome, razão social ou CNPJ (só os dígitos).
  const termo = semAcento(filtros.busca.toLowerCase())
  const digitos = filtros.busca.replace(/\D/g, "")
  const filtradas = todasFontes.filter((f) => {
    if (tipo !== "todos" && chaveCategoriaDaFonte(f, categorias) !== tipo) return false
    if (situacao === "ativas" && f.inativa === true) return false
    if (situacao === "inativas" && f.inativa !== true) return false
    if (termo) {
      const nomes = semAcento(`${f.nome_fantasia ?? ""} ${f.nome_razao ?? ""}`.toLowerCase())
      const porCnpj = digitos.length >= 3 && (f.cnpj_cpf ?? "").includes(digitos)
      if (!nomes.includes(termo) && !porCnpj) return false
    }
    return true
  })
  const { linhas: fontes, pagina, totalPaginas, total } = paginar(
    ordenar(filtradas, filtros, categorias),
    pag
  )
  const filtrando = Boolean(filtros.busca) || tipo !== "todos" || situacao !== "todas"
  const cabecalho = (rotulo: string, coluna: Ordem, alinhamento?: string) => (
    <Ordenavel
      rotulo={rotulo}
      ativa={ordem === coluna}
      asc={filtros.asc}
      alinhamento={alinhamento}
      href={url(filtros, {
        ordem: coluna,
        asc: ordem === coluna ? !filtros.asc : coluna !== "filiados",
      })}
    />
  )

  return (
    <>
      <LembrarLista chave="empregadores" url={url(filtros, { pagina })} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao">
            <ArrowLeft />
            Representação
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Empregadores
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {filtrando
                ? `${total.toLocaleString("pt-BR")} de ${todasFontes.length.toLocaleString("pt-BR")} fontes`
                : `${total.toLocaleString("pt-BR")} fonte${total === 1 ? "" : "s"}`}{" "}
              — empregadores e fundos de pensão que pagam os filiados
            </p>
          </div>
          {podeEditar && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href="/painel/representacao/empregadores/categorias">
                  <Tags />
                  Categorias
                </Link>
              </Button>
              <Button asChild>
                <Link href="/painel/representacao/empregadores/nova">
                  <Plus />
                  Nova fonte
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Fonte pagadora salva com sucesso.</AlertDescription>
        </Alert>
      )}
      {excluida === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Fonte pagadora excluída.</AlertDescription>
        </Alert>
      )}

      <form method="GET" action={BASE} className="flex flex-wrap items-center gap-2">
        {ordem !== "filiados" && <input type="hidden" name="ordem" value={ordem} />}
        {params.dir && <input type="hidden" name="dir" value={params.dir} />}
        {filtros.porPagina !== POR_PAGINA_PADRAO && (
          <input type="hidden" name="porPagina" value={String(filtros.porPagina)} />
        )}
        <div className="relative w-72 max-w-full">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            type="search"
            name="busca"
            defaultValue={filtros.busca}
            placeholder="Nome, razão social ou CNPJ"
            aria-label="Buscar empregador"
            className="pl-8"
          />
        </div>
        <select
          name="tipo"
          defaultValue={tipo}
          aria-label="Filtrar por categoria"
          className={SELECT_FILTRO}
        >
          <option value="todos">Todas as categorias</option>
          {categorias.map((c) => (
            <option key={c.chave} value={c.chave}>
              {c.nome}
            </option>
          ))}
        </select>
        <select
          name="situacao"
          defaultValue={situacao}
          aria-label="Filtrar por condição"
          className={SELECT_FILTRO}
        >
          <option value="todas">Todas as condições</option>
          <option value="ativas">Ativas</option>
          <option value="inativas">Inativas</option>
        </select>
        <Button type="submit" variant="secondary" size="sm">
          Filtrar
        </Button>
        {filtrando && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={url(filtros, { busca: "", tipo: "todos", situacao: "todas" })}>
              Limpar
            </Link>
          </Button>
        )}
      </form>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>{cabecalho("Nome", "nome")}</TableHead>
              <TableHead className="hidden md:table-cell">
                {cabecalho("CNPJ / CPF", "cnpj")}
              </TableHead>
              <TableHead>{cabecalho("Categoria", "categoria")}</TableHead>
              <TableHead className="text-right">
                {cabecalho("Filiados ativos", "filiados", "justify-end")}
              </TableHead>
              <TableHead>{cabecalho("Situação", "situacao")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fontes.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-40">
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                    <Building2 className="size-6" />
                    <p className="text-sm">
                      {filtrando
                        ? "Nenhuma fonte encontrada com estes filtros."
                        : "Nenhuma fonte pagadora cadastrada."}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {fontes.map((f) => {
              const nome = f.nome_fantasia ?? f.nome_razao ?? "(sem nome)"
              return (
                <TableRow key={f.id}>
                  <TableCell className="max-w-64 font-medium">
                    <Link
                      href={`/painel/representacao/empregadores/${f.id}`}
                      className="hover:underline"
                    >
                      <span className="block truncate">{nome}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden font-mono text-xs md:table-cell">
                    {formatarCnpjCpf(f.cnpj_cpf)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {nomeCategoriaDaFonte(f, categorias)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {f.filiadosAtivos.toLocaleString("pt-BR")}
                  </TableCell>
                  <TableCell>
                    {f.inativa === true ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inativa
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-success/40 text-success-fg"
                      >
                        Ativa
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      <Paginacao
        total={total}
        pagina={pagina}
        totalPaginas={totalPaginas}
        porPagina={filtros.porPagina}
        padrao={POR_PAGINA_PADRAO}
      />
    </>
  )
}

function Ordenavel({
  rotulo,
  ativa,
  asc,
  href,
  alinhamento = "justify-start",
}: {
  rotulo: string
  ativa: boolean
  asc: boolean
  href: string
  alinhamento?: string
}) {
  const Icone = !ativa ? ArrowUpDown : asc ? ArrowUp : ArrowDown
  return (
    <Link
      href={href}
      className={`hover:text-foreground flex items-center gap-1 ${alinhamento} ${
        ativa ? "text-foreground font-medium" : ""
      }`}
      aria-label={`Ordenar por ${rotulo}`}
    >
      {rotulo}
      <Icone className={`size-3 ${ativa ? "" : "opacity-40"}`} />
    </Link>
  )
}
