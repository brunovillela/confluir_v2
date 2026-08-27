import type { Metadata } from "next"
import Link from "next/link"
import { ArrowDown, ArrowUp, ReceiptText, Search } from "lucide-react"

import { Paginacao } from "@/components/paginacao"
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
  listarOrdens,
  ORDENS_POR_PAGINA,
  type FiltrosOrdens,
} from "@/lib/db/financeiro"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { OPCOES_POR_PAGINA } from "@/lib/paginacao"
import { cn } from "@/lib/utils"

import { SituacaoBadge } from "../situacao-badge"

export const metadata: Metadata = {
  title: "Ordens de pagamento — Confluir",
}

type ParamsBusca = {
  busca?: string
  situacao?: string
  tipo?: string
  pagina?: string
  porPagina?: string
  ordem?: string
  dir?: string
}

const TIPOS_ORDEM = [
  "todos",
  "Compras",
  "Contrato",
  "Diária",
  "Reembolso",
  "Custeio",
] as const

function normalizarFiltros(params: ParamsBusca): Required<FiltrosOrdens> {
  const situacoes = ["todas", "abertas", "pagas", "canceladas"] as const
  const ordens = ["vencimento", "pagamento", "valor"] as const
  return {
    busca: params.busca ?? "",
    situacao: situacoes.includes(params.situacao as never)
      ? (params.situacao as (typeof situacoes)[number])
      : "todas",
    tipo: (TIPOS_ORDEM as readonly string[]).includes(params.tipo ?? "")
      ? params.tipo!
      : "todos",
    pagina: Math.max(1, Number(params.pagina) || 1),
    porPagina: (OPCOES_POR_PAGINA as readonly number[]).includes(
      Number(params.porPagina)
    )
      ? Number(params.porPagina)
      : ORDENS_POR_PAGINA,
    ordem: ordens.includes(params.ordem as never)
      ? (params.ordem as (typeof ordens)[number])
      : "vencimento",
    dir: params.dir === "asc" ? "asc" : "desc",
  }
}

function montarUrl(
  filtros: Required<FiltrosOrdens>,
  mudancas: Partial<Record<keyof FiltrosOrdens, string | number>>
): string {
  const merged = { ...filtros, ...mudancas }
  const q = new URLSearchParams()
  if (merged.busca) q.set("busca", String(merged.busca))
  if (merged.situacao !== "todas") q.set("situacao", String(merged.situacao))
  if (merged.tipo !== "todos") q.set("tipo", String(merged.tipo))
  if (Number(merged.pagina) > 1) q.set("pagina", String(merged.pagina))
  if (Number(merged.porPagina) !== ORDENS_POR_PAGINA)
    q.set("porPagina", String(merged.porPagina))
  if (merged.ordem !== "vencimento") q.set("ordem", String(merged.ordem))
  if (merged.dir !== "desc") q.set("dir", String(merged.dir))
  const query = q.toString()
  return `/painel/financeiro/ordens${query ? `?${query}` : ""}`
}

function CabecalhoOrdenavel({
  filtros,
  campo,
  children,
  className,
}: {
  filtros: Required<FiltrosOrdens>
  campo: "vencimento" | "pagamento" | "valor"
  children: React.ReactNode
  className?: string
}) {
  const ativo = filtros.ordem === campo
  const proximaDir = ativo && filtros.dir === "desc" ? "asc" : "desc"
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

const CHIPS_SITUACAO = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "abertas", rotulo: "Em aberto" },
  { valor: "pagas", rotulo: "Pagas" },
  { valor: "canceladas", rotulo: "Canceladas" },
] as const

export default async function OrdensPage({
  searchParams,
}: {
  searchParams: Promise<ParamsBusca>
}) {
  await requirePermissao("financeiro_pagamento", ["financeiro_leitura"])

  const filtros = normalizarFiltros(await searchParams)
  const lista = await listarOrdens(filtros)

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Ordens de pagamento
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {lista.total.toLocaleString("pt-BR")} orde
          {lista.total === 1 ? "m" : "ns"}
          {filtros.busca && <> para “{filtros.busca}”</>}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form method="GET" className="flex min-w-0 flex-1 items-center gap-2">
          {filtros.situacao !== "todas" && (
            <input type="hidden" name="situacao" value={filtros.situacao} />
          )}
          {filtros.tipo !== "todos" && (
            <input type="hidden" name="tipo" value={filtros.tipo} />
          )}
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              name="busca"
              defaultValue={filtros.busca}
              placeholder="Descrição ou código"
              className="pl-8"
              aria-label="Buscar ordem"
            />
          </div>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>

        <div
          className="flex flex-wrap items-center gap-1.5"
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
              <Link
                href={montarUrl(filtros, { situacao: chip.valor, pagina: 1 })}
              >
                {chip.rotulo}
              </Link>
            </Button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filtrar por tipo">
          {TIPOS_ORDEM.map((t) => (
            <Button
              key={t}
              variant={filtros.tipo === t ? "default" : "outline"}
              size="sm"
              asChild
            >
              <Link href={montarUrl(filtros, { tipo: t, pagina: 1 })}>
                {t === "todos" ? "Todos os tipos" : t}
              </Link>
            </Button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Código</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead className="hidden lg:table-cell">Favorecido</TableHead>
              <TableHead className="hidden md:table-cell">Tipo</TableHead>
              <CabecalhoOrdenavel filtros={filtros} campo="vencimento">
                Vencimento
              </CabecalhoOrdenavel>
              <CabecalhoOrdenavel
                filtros={filtros}
                campo="pagamento"
                className="hidden xl:table-cell"
              >
                Pagamento
              </CabecalhoOrdenavel>
              <CabecalhoOrdenavel
                filtros={filtros}
                campo="valor"
                className="text-right"
              >
                Valor
              </CabecalhoOrdenavel>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="h-40">
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                    <ReceiptText className="size-6" />
                    <p className="text-sm">
                      Nenhuma ordem encontrada
                      {filtros.busca && <> para “{filtros.busca}”</>}
                      .
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {lista.linhas.map((o) => (
              <TableRow key={o.id}>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  <Link
                    href={`/painel/financeiro/ordens/${o.id}`}
                    className="hover:text-foreground hover:underline"
                  >
                    {o.codigo ?? "—"}
                  </Link>
                </TableCell>
                <TableCell className="max-w-72 font-medium">
                  <Link
                    href={`/painel/financeiro/ordens/${o.id}`}
                    className="hover:underline"
                  >
                    <span className="block truncate">{o.descricao ?? "—"}</span>
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground hidden max-w-48 truncate lg:table-cell">
                  {o.favorecido ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground hidden max-w-44 truncate md:table-cell">
                  {o.tipo ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {formatarData(o.vencimento)}
                </TableCell>
                <TableCell className="text-muted-foreground hidden whitespace-nowrap xl:table-cell">
                  {formatarData(o.data_pagamento)}
                </TableCell>
                <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                  {formatarMoeda(o.valor_pago ?? o.valor_inicial_cobranca)}
                </TableCell>
                <TableCell>
                  <SituacaoBadge situacao={o.situacao} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Paginacao
        total={lista.total}
        pagina={lista.pagina}
        totalPaginas={lista.totalPaginas}
        porPagina={filtros.porPagina}
        padrao={ORDENS_POR_PAGINA}
      />
    </>
  )
}
