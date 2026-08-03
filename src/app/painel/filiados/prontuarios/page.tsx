import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  NotebookPen,
  Search,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
  listarTodosProntuarios,
  type ApontamentoGeral,
} from "@/lib/db/prontuario"
import { formatarData } from "@/lib/formato"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Prontuários — Confluir" }

const POR_PAGINA = 50

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Ordem = "data" | "filiado" | "tipo" | "autor"

type Filtros = {
  busca: string
  tipo: string
  ordem: Ordem
  dir: "asc" | "desc"
  pagina: number
}

function montarUrl(f: Filtros, mudancas: Partial<Filtros>): string {
  const merged = { ...f, ...mudancas }
  const q = new URLSearchParams()
  if (merged.busca) q.set("busca", merged.busca)
  if (merged.tipo) q.set("tipo", merged.tipo)
  if (merged.ordem !== "data") q.set("ordem", merged.ordem)
  if (merged.dir !== "desc") q.set("dir", merged.dir)
  if (merged.pagina > 1) q.set("pagina", String(merged.pagina))
  const query = q.toString()
  return `/painel/filiados/prontuarios${query ? `?${query}` : ""}`
}

function CabecalhoOrdenavel({
  filtros,
  campo,
  className,
  children,
}: {
  filtros: Filtros
  campo: Ordem
  className?: string
  children: React.ReactNode
}) {
  const ativo = filtros.ordem === campo
  const proximaDir = ativo && filtros.dir === "asc" ? "desc" : "asc"
  return (
    <TableHead className={className}>
      <Link
        href={montarUrl(filtros, { ordem: campo, dir: proximaDir, pagina: 1 })}
        className={cn(
          "hover:text-foreground inline-flex items-center gap-1",
          ativo && "text-foreground font-medium"
        )}
      >
        {children}
        {ativo &&
          (filtros.dir === "asc" ? (
            <ArrowUp className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          ))}
      </Link>
    </TableHead>
  )
}

function comparar(a: ApontamentoGeral, b: ApontamentoGeral, f: Filtros): number {
  const sinal = f.dir === "desc" ? -1 : 1
  const valor = (x: ApontamentoGeral): string | null =>
    f.ordem === "filiado"
      ? x.filiadoNome
      : f.ordem === "tipo"
        ? x.tipo
        : f.ordem === "autor"
          ? x.autor
          : x.data
  const va = valor(a)
  const vb = valor(b)
  if (va === null && vb === null) return 0
  if (va === null) return 1
  if (vb === null) return -1
  return sinal * va.localeCompare(vb, "pt-BR")
}

export default async function ProntuariosPage({
  searchParams,
}: {
  searchParams: Promise<{
    busca?: string
    tipo?: string
    ordem?: string
    dir?: string
    pagina?: string
  }>
}) {
  await requirePermissao("filiacao_filiados", [
    "filiacao_gestao",
    "filiacao_receitas",
  ])

  const sp = await searchParams
  const { disponivel, apontamentos, tipos } =
    await listarTodosProntuarios()

  const filtros: Filtros = {
    busca: sp.busca ?? "",
    tipo: tipos.includes(sp.tipo ?? "") ? sp.tipo! : "",
    ordem: (["data", "filiado", "tipo", "autor"] as const).includes(
      sp.ordem as never
    )
      ? (sp.ordem as Ordem)
      : "data",
    dir: sp.dir === "asc" ? "asc" : "desc",
    pagina: Math.max(1, Number(sp.pagina) || 1),
  }

  const termo = filtros.busca.trim().toLowerCase()
  const filtrados = apontamentos
    .filter((a) => {
      if (filtros.tipo && a.tipo !== filtros.tipo) return false
      if (!termo) return true
      return (
        (a.filiadoNome ?? "").toLowerCase().includes(termo) ||
        (a.descricao ?? "").toLowerCase().includes(termo) ||
        (a.autor ?? "").toLowerCase().includes(termo)
      )
    })
    .sort((a, b) => comparar(a, b, filtros))

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaAtual = Math.min(filtros.pagina, totalPaginas)
  const daPagina = filtrados.slice(
    (paginaAtual - 1) * POR_PAGINA,
    paginaAtual * POR_PAGINA
  )

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/filiados">
            <ArrowLeft />
            Filiados
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Prontuários
          </h1>
          <NotebookPen className="text-muted-foreground size-5" />
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {filtrados.length.toLocaleString("pt-BR")} apontamento
          {filtrados.length === 1 ? "" : "s"}
          {filtros.busca && <> para “{filtros.busca}”</>}
          {filtros.tipo && <> · tipo: {filtros.tipo}</>}
        </p>
      </div>

      {!disponivel && (
        <Alert variant="destructive">
          <AlertDescription>
            A tabela do prontuário ainda não existe no banco.
          </AlertDescription>
        </Alert>
      )}

      <form method="GET" className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            name="busca"
            defaultValue={filtros.busca}
            placeholder="Filiado, texto do apontamento ou autor"
            className="pl-8"
            aria-label="Buscar apontamento"
          />
        </div>
        <select
          name="tipo"
          defaultValue={filtros.tipo}
          aria-label="Filtrar por tipo"
          className={SELECT_FILTRO}
        >
          <option value="">Todos os tipos</option>
          {tipos.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <CabecalhoOrdenavel filtros={filtros} campo="data">
                Data
              </CabecalhoOrdenavel>
              <CabecalhoOrdenavel filtros={filtros} campo="filiado">
                Filiado
              </CabecalhoOrdenavel>
              <CabecalhoOrdenavel
                filtros={filtros}
                campo="tipo"
                className="hidden md:table-cell"
              >
                Tipo
              </CabecalhoOrdenavel>
              <TableHead>Apontamento</TableHead>
              <CabecalhoOrdenavel
                filtros={filtros}
                campo="autor"
                className="hidden lg:table-cell"
              >
                Autor
              </CabecalhoOrdenavel>
            </TableRow>
          </TableHeader>
          <TableBody>
            {daPagina.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-32">
                  <p className="text-muted-foreground text-center text-sm">
                    Nenhum apontamento encontrado.
                  </p>
                </TableCell>
              </TableRow>
            )}
            {daPagina.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {formatarData(a.data)}
                </TableCell>
                <TableCell className="max-w-48 font-medium">
                  <Link
                    href={`/painel/filiados/${a.filiadoId}/prontuario`}
                    className="hover:underline"
                  >
                    <span className="block truncate">
                      {a.filiadoNome ?? "(sem nome)"}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {a.tipo ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      {a.tipo}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground max-w-md">
                  <span className="block truncate">{a.descricao ?? "—"}</span>
                </TableCell>
                <TableCell className="text-muted-foreground hidden lg:table-cell">
                  {a.autor ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPaginas > 1 && (
        <div className="flex items-center justify-between gap-4">
          <p className="text-muted-foreground text-sm">
            Página {paginaAtual} de {totalPaginas}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild disabled={paginaAtual <= 1}>
              {paginaAtual > 1 ? (
                <Link href={montarUrl(filtros, { pagina: paginaAtual - 1 })}>
                  Anterior
                </Link>
              ) : (
                <span>Anterior</span>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              asChild
              disabled={paginaAtual >= totalPaginas}
            >
              {paginaAtual < totalPaginas ? (
                <Link href={montarUrl(filtros, { pagina: paginaAtual + 1 })}>
                  Próxima
                </Link>
              ) : (
                <span>Próxima</span>
              )}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
