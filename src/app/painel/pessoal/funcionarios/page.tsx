import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BriefcaseBusiness,
  Search,
} from "lucide-react"

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
  listarFuncionarios,
  type FiltrosFuncionarios,
} from "@/lib/db/pessoal"
import { formatarData } from "@/lib/formato"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Funcionários — Confluir" }

type ParamsBusca = {
  busca?: string
  situacao?: string
  ordem?: string
  dir?: string
}

function normalizarFiltros(params: ParamsBusca): Required<FiltrosFuncionarios> {
  const situacoes = ["ativos", "desligados", "todos"] as const
  const ordens = ["nome", "admissao", "matricula"] as const
  return {
    busca: params.busca ?? "",
    situacao: situacoes.includes(params.situacao as never)
      ? (params.situacao as (typeof situacoes)[number])
      : "ativos",
    ordem: ordens.includes(params.ordem as never)
      ? (params.ordem as (typeof ordens)[number])
      : "nome",
    dir: params.dir === "desc" ? "desc" : "asc",
  }
}

function montarUrl(
  filtros: Required<FiltrosFuncionarios>,
  mudancas: Partial<Record<keyof FiltrosFuncionarios, string>>
): string {
  const merged = { ...filtros, ...mudancas }
  const q = new URLSearchParams()
  if (merged.busca) q.set("busca", merged.busca)
  if (merged.situacao !== "ativos") q.set("situacao", merged.situacao)
  if (merged.ordem !== "nome") q.set("ordem", merged.ordem)
  if (merged.dir !== "asc") q.set("dir", merged.dir)
  const query = q.toString()
  return `/painel/pessoal/funcionarios${query ? `?${query}` : ""}`
}

function CabecalhoOrdenavel({
  filtros,
  campo,
  children,
  className,
}: {
  filtros: Required<FiltrosFuncionarios>
  campo: "nome" | "admissao" | "matricula"
  children: React.ReactNode
  className?: string
}) {
  const ativo = filtros.ordem === campo
  const proximaDir = ativo && filtros.dir === "asc" ? "desc" : "asc"
  return (
    <TableHead className={className}>
      <Link
        href={montarUrl(filtros, { ordem: campo, dir: proximaDir })}
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

const CHIPS_SITUACAO = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "desligados", rotulo: "Desligados" },
  { valor: "todos", rotulo: "Todos" },
] as const

export default async function FuncionariosPage({
  searchParams,
}: {
  searchParams: Promise<ParamsBusca>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_contracheque"])

  const filtros = normalizarFiltros(await searchParams)
  const lista = await listarFuncionarios(filtros)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal">
            <ArrowLeft />
            Pessoal
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Funcionários</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {lista.ativos.toLocaleString("pt-BR")} funcionário
          {lista.ativos === 1 ? "" : "s"} ativo
          {lista.ativos === 1 ? "" : "s"} ·{" "}
          {lista.total.toLocaleString("pt-BR")} no total
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form method="GET" className="flex min-w-0 flex-1 items-center gap-2">
          {filtros.situacao !== "ativos" && (
            <input type="hidden" name="situacao" value={filtros.situacao} />
          )}
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              name="busca"
              defaultValue={filtros.busca}
              placeholder="Nome, cargo, lotação ou matrícula"
              className="pl-8"
              aria-label="Buscar funcionário"
            />
          </div>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>

        <div
          className="flex items-center gap-1.5"
          role="group"
          aria-label="Filtrar por situação"
        >
          {CHIPS_SITUACAO.map((chip) => (
            <Button
              key={chip.valor}
              variant={filtros.situacao === chip.valor ? "default" : "outline"}
              size="sm"
              asChild
            >
              <Link href={montarUrl(filtros, { situacao: chip.valor })}>
                {chip.rotulo}
              </Link>
            </Button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <CabecalhoOrdenavel filtros={filtros} campo="nome">
                Nome
              </CabecalhoOrdenavel>
              <TableHead>Cargo</TableHead>
              <TableHead className="hidden md:table-cell">Lotação</TableHead>
              <CabecalhoOrdenavel
                filtros={filtros}
                campo="matricula"
                className="hidden lg:table-cell"
              >
                Matrícula
              </CabecalhoOrdenavel>
              <CabecalhoOrdenavel filtros={filtros} campo="admissao">
                Admissão
              </CabecalhoOrdenavel>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-40">
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                    <BriefcaseBusiness className="size-6" />
                    <p className="text-sm">
                      Nenhum funcionário encontrado
                      {filtros.busca && <> para “{filtros.busca}”</>}.
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {lista.linhas.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="max-w-64 font-medium">
                  <Link
                    href={`/painel/pessoal/${f.usuarioId}`}
                    className="hover:underline"
                  >
                    <span className="block truncate">
                      {f.nome ?? "(sem nome)"}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground max-w-48 truncate">
                  {f.cargo ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground hidden max-w-40 truncate md:table-cell">
                  {f.lotacao ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground hidden lg:table-cell">
                  {f.matricula ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatarData(f.contrato_admissao)}
                </TableCell>
                <TableCell>
                  {f.contrato_demissao ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      Desligado
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-success/40 text-success-fg"
                    >
                      Ativo
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
