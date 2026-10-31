import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ReceiptText,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react"

import { EmpresaCombobox } from "@/components/empresa-combobox"
import { Paginacao } from "@/components/paginacao"
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
  filtroSituacaoOrdem,
  extratoOrdens,
  listarOrdens,
  opcoesFiltrosOrdens,
  ORDENS_POR_PAGINA,
  SITUACOES_ORDEM,
  type FiltrosOrdens,
} from "@/lib/db/financeiro"
import { TIPO_ORDEM_FOLHA } from "@/lib/contracheques-constantes"
import { TIPO_ORDEM_RPA } from "@/lib/rpa-calculo"
import { TIPO_ORDEM_FATURA_CARTAO } from "@/lib/ordens-situacoes"
import { TIPO_ORDEM_TRIBUTO } from "@/lib/tributos-constantes"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { OPCOES_POR_PAGINA } from "@/lib/paginacao"
import { cn } from "@/lib/utils"

import { SituacaoBadge } from "../situacao-badge"
import { ExtratoOrdensView } from "./extrato"
import { FiltroDeptoCentro } from "./filtro-depto-centro"
import { LembrarLista } from "@/components/voltar-lista"
import { ExportarXlsx } from "@/components/exportar-xlsx"

export const metadata: Metadata = {
  title: "Ordens de pagamento — Confluir",
}

type ParamsBusca = {
  busca?: string
  situacao?: string
  tipo?: string
  beneficiario?: string
  centroCusto?: string
  departamento?: string
  projeto?: string
  formaPagamento?: string
  pagina?: string
  porPagina?: string
  ordem?: string
  dir?: string
  /** "lista" = tabela; padrão = extrato (como o do banco). */
  visao?: string
  /** Extrato: quantos dias de pagas para trás. */
  dias?: string
  /** Extrato: "todos" mostra todos os futuros. */
  futuros?: string
}

/** Filtros da página: os da lista e a visão (extrato ou tabela). */
type FiltrosPagina = Required<FiltrosOrdens> & { visao: "extrato" | "lista" }

/** Estilo dos <select> nativos do painel de filtros. */
const CLS_SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [color-scheme:light] dark:[color-scheme:dark]"

function Campo({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
    </div>
  )
}

const TIPOS_ORDEM = [
  "todos",
  "Compras",
  "Contrato",
  "Diária",
  "Reembolso",
  "Custeio",
  TIPO_ORDEM_FOLHA,
  TIPO_ORDEM_RPA,
  "Hospedagem",
  "Multa de trânsito",
  "Locação de veículos - Mensalidade",
  TIPO_ORDEM_FATURA_CARTAO,
  TIPO_ORDEM_TRIBUTO,
] as const

function normalizarFiltros(params: ParamsBusca): FiltrosPagina {
  const ordens = ["vencimento", "pagamento", "valor"] as const
  return {
    busca: params.busca ?? "",
    situacao: filtroSituacaoOrdem(params.situacao),
    tipo: (TIPOS_ORDEM as readonly string[]).includes(params.tipo ?? "")
      ? params.tipo!
      : "todos",
    beneficiario: params.beneficiario ?? "",
    centroCusto: params.centroCusto ?? "",
    departamento: params.departamento ?? "",
    projeto: params.projeto ?? "",
    formaPagamento: params.formaPagamento ?? "",
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
    visao: params.visao === "lista" ? "lista" : "extrato",
  }
}

function montarUrl(
  filtros: FiltrosPagina,
  mudancas: Partial<Record<keyof FiltrosPagina, string | number>>
): string {
  const merged = { ...filtros, ...mudancas }
  const q = new URLSearchParams()
  if (merged.busca) q.set("busca", String(merged.busca))
  if (merged.situacao !== "todas") q.set("situacao", String(merged.situacao))
  if (merged.tipo !== "todos") q.set("tipo", String(merged.tipo))
  if (merged.beneficiario) q.set("beneficiario", String(merged.beneficiario))
  if (merged.centroCusto) q.set("centroCusto", String(merged.centroCusto))
  if (merged.departamento) q.set("departamento", String(merged.departamento))
  if (merged.projeto) q.set("projeto", String(merged.projeto))
  if (merged.formaPagamento)
    q.set("formaPagamento", String(merged.formaPagamento))
  if (Number(merged.pagina) > 1) q.set("pagina", String(merged.pagina))
  if (Number(merged.porPagina) !== ORDENS_POR_PAGINA)
    q.set("porPagina", String(merged.porPagina))
  if (merged.ordem !== "vencimento") q.set("ordem", String(merged.ordem))
  if (merged.dir !== "desc") q.set("dir", String(merged.dir))
  if (merged.visao === "lista") q.set("visao", "lista")
  const query = q.toString()
  return `/painel/financeiro/ordens${query ? `?${query}` : ""}`
}

function CabecalhoOrdenavel({
  filtros,
  campo,
  children,
  className,
}: {
  filtros: FiltrosPagina
  campo: "vencimento" | "pagamento" | "valor"
  children: React.ReactNode
  className?: string
}) {
  const ativo = filtros.ordem === campo
  const proximaDir = ativo && filtros.dir === "desc" ? "asc" : "desc"
  return (
    <TableHead className={className}>
      <Link scroll={false}
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

// O grupo "Em aberto" segue útil; depois, cada situação real do ciclo.
const CHIPS_SITUACAO: { valor: string; rotulo: string }[] = [
  { valor: "todas", rotulo: "Todas" },
  { valor: "abertas", rotulo: "Em aberto (todas as não pagas)" },
  ...SITUACOES_ORDEM.map((s) => ({ valor: s, rotulo: s })),
]

export default async function OrdensPage({
  searchParams,
}: {
  searchParams: Promise<ParamsBusca>
}) {
  await requirePermissao("financeiro_pagamento", ["financeiro_leitura"])

  const params = await searchParams
  const filtros = normalizarFiltros(params)
  const dias = Math.min(Math.max(Number(params.dias) || 30, 30), 1095)
  const futurosTodos = params.futuros === "todos"
  const extratoUrl = (m: { dias?: number; futuros?: string }) => {
    const u = new URLSearchParams(montarUrl(filtros, {}).split("?")[1] ?? "")
    const d = m.dias ?? dias
    if (d !== 30) u.set("dias", String(d))
    if ((m.futuros ?? (futurosTodos ? "todos" : "")) === "todos") u.set("futuros", "todos")
    const q = u.toString()
    return `/painel/financeiro/ordens${q ? `?${q}` : ""}`
  }
  const [lista, extrato, opcoes] = await Promise.all([
    filtros.visao === "lista" ? listarOrdens(filtros) : null,
    filtros.visao === "extrato" ? extratoOrdens(filtros, { dias, futurosDias: futurosTodos ? null : 30 }) : null,
    opcoesFiltrosOrdens(),
  ])

  const nomeFornecedor = (id: string) =>
    [...opcoes.fornecedores, ...opcoes.pessoasFavorecidas].find((f) => f.id === id)?.nome ?? "beneficiário"
  const nomeCentro = (id: string) =>
    opcoes.centrosCusto.find((c) => c.id === id)?.nome ?? "centro de custo"
  const nomeDepto = (id: string) =>
    opcoes.departamentos.find((d) => d.id === id)?.nome ?? "departamento"
  const nomeProjeto = (id: string) =>
    opcoes.projetos.find((p) => p.id === id)?.nome ?? "projeto"
  const rotuloSituacao = (s: string) =>
    CHIPS_SITUACAO.find((c) => c.valor === s)?.rotulo ?? s

  const chips = [
    filtros.situacao !== "todas" && {
      rotulo: `Situação: ${rotuloSituacao(filtros.situacao)}`,
      href: montarUrl(filtros, { situacao: "todas", pagina: 1 }),
    },
    filtros.tipo !== "todos" && {
      rotulo: `Tipo: ${filtros.tipo}`,
      href: montarUrl(filtros, { tipo: "todos", pagina: 1 }),
    },
    filtros.beneficiario && {
      rotulo: `Favorecido: ${nomeFornecedor(filtros.beneficiario)}`,
      href: montarUrl(filtros, { beneficiario: "", pagina: 1 }),
    },
    filtros.centroCusto && {
      rotulo: `Centro de custo: ${nomeCentro(filtros.centroCusto)}`,
      href: montarUrl(filtros, { centroCusto: "", pagina: 1 }),
    },
    filtros.departamento && {
      rotulo: `Departamento: ${nomeDepto(filtros.departamento)}`,
      href: montarUrl(filtros, { departamento: "", pagina: 1 }),
    },
    filtros.projeto && {
      rotulo: `Projeto: ${nomeProjeto(filtros.projeto)}`,
      href: montarUrl(filtros, { projeto: "", pagina: 1 }),
    },
    filtros.formaPagamento && {
      rotulo: `Forma: ${filtros.formaPagamento}`,
      href: montarUrl(filtros, { formaPagamento: "", pagina: 1 }),
    },
  ].filter(Boolean) as { rotulo: string; href: string }[]

  // Favorecido: empresas, pessoas do quadro e filiados (reembolso/custeio).
  const fornecedoresOpt = [
    ...opcoes.fornecedores.map((f) => ({ ...f, bloqueado: false })),
    ...opcoes.pessoasFavorecidas.map((p) => ({ ...p, bloqueado: false })),
  ]

  return (
    <>
      <LembrarLista chave="ordens" url={montarUrl(filtros, {})} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Ordens de pagamento
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {lista ? (
              <>
                {lista.total.toLocaleString("pt-BR")} orde
                {lista.total === 1 ? "m" : "ns"}
              </>
            ) : (
              "Extrato: o que vem pela frente, o dia de hoje e o que já foi pago"
            )}
            {filtros.busca && <> para “{filtros.busca}”</>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-muted inline-flex rounded-lg p-0.5 text-sm">
            {(["extrato", "lista"] as const).map((v) => (
              <Link
                key={v}
                href={montarUrl(filtros, { visao: v, pagina: 1 })}
                className={cn(
                  "rounded-md px-3 py-1",
                  filtros.visao === v ? "bg-background font-medium shadow-xs" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {v === "extrato" ? "Extrato" : "Lista"}
              </Link>
            ))}
          </div>
          <ExportarXlsx href="/painel/financeiro/ordens/exportar" />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <form method="GET" className="flex min-w-0 items-center gap-2">
          {/* Preserva os filtros ativos ao buscar. */}
          {filtros.visao === "lista" && <input type="hidden" name="visao" value="lista" />}
          {filtros.situacao !== "todas" && (
            <input type="hidden" name="situacao" value={filtros.situacao} />
          )}
          {filtros.tipo !== "todos" && (
            <input type="hidden" name="tipo" value={filtros.tipo} />
          )}
          {filtros.beneficiario && (
            <input type="hidden" name="beneficiario" value={filtros.beneficiario} />
          )}
          {filtros.centroCusto && (
            <input type="hidden" name="centroCusto" value={filtros.centroCusto} />
          )}
          {filtros.departamento && (
            <input type="hidden" name="departamento" value={filtros.departamento} />
          )}
          {filtros.projeto && (
            <input type="hidden" name="projeto" value={filtros.projeto} />
          )}
          {filtros.formaPagamento && (
            <input type="hidden" name="formaPagamento" value={filtros.formaPagamento} />
          )}
          {filtros.porPagina !== ORDENS_POR_PAGINA && (
            <input type="hidden" name="porPagina" value={filtros.porPagina} />
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

        <details
          open={chips.length > 0}
          className="group border-input bg-card rounded-lg border"
        >
          <summary className="flex cursor-pointer items-center justify-between gap-2 px-4 py-2.5 text-sm font-medium select-none [&::-webkit-details-marker]:hidden">
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="text-muted-foreground size-4" />
              Filtros
              {chips.length > 0 && (
                <Badge variant="secondary">{chips.length}</Badge>
              )}
            </span>
            <ChevronDown className="text-muted-foreground size-4 transition-transform group-open:rotate-180" />
          </summary>
          <form method="GET" className="border-input grid gap-4 border-t p-4">
            {filtros.busca && (
              <input type="hidden" name="busca" value={filtros.busca} />
            )}
            {filtros.visao === "lista" && <input type="hidden" name="visao" value="lista" />}
            {filtros.porPagina !== ORDENS_POR_PAGINA && (
              <input type="hidden" name="porPagina" value={filtros.porPagina} />
            )}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo label="Situação">
                <select
                  name="situacao"
                  defaultValue={filtros.situacao}
                  aria-label="Situação"
                  className={CLS_SELECT}
                >
                  {CHIPS_SITUACAO.map((s) => (
                    <option key={s.valor} value={s.valor}>
                      {s.rotulo}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Tipo">
                <select
                  name="tipo"
                  defaultValue={filtros.tipo}
                  aria-label="Tipo"
                  className={CLS_SELECT}
                >
                  {TIPOS_ORDEM.map((t) => (
                    <option key={t} value={t}>
                      {t === "todos" ? "Todos os tipos" : t}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Forma de pagamento">
                <select
                  name="formaPagamento"
                  defaultValue={filtros.formaPagamento}
                  aria-label="Forma de pagamento"
                  className={CLS_SELECT}
                >
                  <option value="">Todas</option>
                  {opcoes.formasPagamento.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </Campo>
              <FiltroDeptoCentro
                departamentos={opcoes.departamentos}
                centros={opcoes.centrosCusto}
                defaultDepartamento={filtros.departamento}
                defaultCentro={filtros.centroCusto}
              />
              <Campo label="Projeto">
                <select
                  name="projeto"
                  defaultValue={filtros.projeto}
                  aria-label="Projeto"
                  className={CLS_SELECT}
                >
                  <option value="">Todos os projetos</option>
                  {opcoes.projetos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label="Favorecido">
                <EmpresaCombobox
                  empresas={fornecedoresOpt}
                  name="beneficiario"
                  defaultId={filtros.beneficiario || undefined}
                />
              </Campo>
            </div>
            <div className="flex items-center gap-2">
              <Button type="submit">Aplicar filtros</Button>
              {chips.length > 0 && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/painel/financeiro/ordens">Limpar filtros</Link>
                </Button>
              )}
            </div>
          </form>
        </details>

        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((c) => (
              <Link
                key={c.rotulo}
                href={c.href}
                className="border-input bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs transition-colors"
              >
                {c.rotulo}
                <X className="size-3" />
              </Link>
            ))}
          </div>
        )}
      </div>

      {extrato && (
        <ExtratoOrdensView
          extrato={extrato}
          urlMaisFuturos={futurosTodos ? null : extratoUrl({ futuros: "todos" })}
          urlMaisPassado={extratoUrl({ dias: dias + 30 })}
        />
      )}

      {lista && (
      <>
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
      )}
    </>
  )
}
