import type { Metadata } from "next"
import Link from "next/link"
import { ArrowDown, ArrowLeft, ArrowUp, Fuel, Plus } from "lucide-react"

import { Paginacao } from "@/components/paginacao"
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
import { requirePermissao } from "@/lib/auth"
import {
  listarAbastecimentos,
  listarCondutores,
  listarVeiculos,
  ORDENS_ABASTECIMENTO,
  type OrdemAbastecimento,
} from "@/lib/db/veiculos"
import { formatarDataHora, formatarMoeda } from "@/lib/formato"
import { lerPaginacao } from "@/lib/paginacao"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Abastecimentos — Confluir" }

const BASE = "/painel/veiculos/abastecimentos"
const PADRAO_POR_PAGINA = 30
const SELECT =
  "border-input bg-background text-foreground h-9 max-w-56 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Params = Record<string, string | undefined>

type Filtros = {
  busca: string
  veiculo: string
  condutor: string
  de: string
  ate: string
  ordem: OrdemAbastecimento
  dir: "asc" | "desc"
  porPagina: number
}

function url(f: Filtros, mudancas: Partial<Filtros> & { pagina?: number }): string {
  const final = { ...f, ...mudancas }
  const q = new URLSearchParams()
  if (final.busca) q.set("busca", final.busca)
  if (final.veiculo) q.set("veiculo", final.veiculo)
  if (final.condutor) q.set("condutor", final.condutor)
  if (final.de) q.set("de", final.de)
  if (final.ate) q.set("ate", final.ate)
  if (final.ordem !== "data" || final.dir !== "desc") {
    q.set("ordem", final.ordem)
    q.set("dir", final.dir)
  }
  if (final.porPagina !== PADRAO_POR_PAGINA) q.set("porPagina", String(final.porPagina))
  if (mudancas.pagina && mudancas.pagina > 1) q.set("pagina", String(mudancas.pagina))
  const s = q.toString()
  return s ? `${BASE}?${s}` : BASE
}

function Ordenavel({
  f,
  campo,
  children,
  className,
}: {
  f: Filtros
  campo: OrdemAbastecimento
  children: React.ReactNode
  className?: string
}) {
  const ativo = f.ordem === campo
  // Posto começa em A→Z; data e números, do maior/mais recente.
  const inicial = campo === "posto" ? "asc" : "desc"
  const proxima = ativo ? (f.dir === "asc" ? "desc" : "asc") : inicial
  return (
    <TableHead className={className}>
      <Link
        href={url(f, { ordem: campo, dir: proxima })}
        className={cn("hover:text-foreground inline-flex items-center gap-1", ativo && "text-foreground font-medium")}
      >
        {children}
        {ativo && (f.dir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />)}
      </Link>
    </TableHead>
  )
}

const dataValida = (v: string | undefined) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "")

export default async function AbastecimentosPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requirePermissao("veiculos_gestao")
  const brutos = await searchParams
  const paginacao = lerPaginacao(brutos, PADRAO_POR_PAGINA)
  const f: Filtros = {
    busca: (brutos.busca ?? "").trim(),
    veiculo: (brutos.veiculo ?? "").trim(),
    condutor: (brutos.condutor ?? "").trim(),
    de: dataValida(brutos.de),
    ate: dataValida(brutos.ate),
    ordem: ORDENS_ABASTECIMENTO.includes(brutos.ordem as OrdemAbastecimento)
      ? (brutos.ordem as OrdemAbastecimento)
      : "data",
    dir: brutos.dir === "asc" ? "asc" : "desc",
    porPagina: paginacao.porPagina,
  }

  const [lista, frota, condutoresRes] = await Promise.all([
    listarAbastecimentos({
      busca: f.busca,
      veiculoId: f.veiculo || undefined,
      condutorId: f.condutor || undefined,
      de: f.de || undefined,
      ate: f.ate || undefined,
      ordem: f.ordem,
      dir: f.dir,
      pagina: paginacao.pagina,
      porPagina: paginacao.porPagina,
    }),
    listarVeiculos({ situacao: "todos" }),
    listarCondutores(),
  ])
  const veiculos = frota.map((v) => ({
    id: v.id,
    rotulo: `${v.placa ?? "s/ placa"} — ${v.marca_modelo ?? ""}${v.inativo ? " (inativo)" : ""}`,
  }))
  const condutores = condutoresRes.condutores
    .map((c) => ({ id: c.usuario_id, rotulo: c.usuarioNome ?? "(sem nome)" }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"))
  const filtrando = Boolean(f.busca || f.veiculo || f.condutor || f.de || f.ate)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/veiculos">
            <ArrowLeft />
            Veículos
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Abastecimentos</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {lista.total.toLocaleString("pt-BR")} lançamento{lista.total === 1 ? "" : "s"}
              {filtrando ? " no filtro" : ""} — clique no título de uma coluna para ordenar e numa linha para editar
            </p>
          </div>
          <Button asChild>
            <Link href={`${BASE}/novo`}>
              <Plus />
              Incluir abastecimentos
            </Link>
          </Button>
        </div>
      </div>

      {brutos.salvo && (
        <Alert variant="success">
          <AlertDescription>Abastecimento lançado.</AlertDescription>
        </Alert>
      )}
      {brutos.importados && (
        <Alert variant="success">
          <AlertDescription>
            Fatura importada: {brutos.importados} lançamento
            {Number(brutos.importados) === 1 ? "" : "s"}.
          </AlertDescription>
        </Alert>
      )}
      {brutos.excluido && (
        <Alert variant="success">
          <AlertDescription>Lançamento excluído.</AlertDescription>
        </Alert>
      )}

      <form className="flex flex-wrap items-end gap-2" action={BASE}>
        <input
          type="search"
          name="busca"
          defaultValue={f.busca}
          placeholder="Posto, cidade, combustível ou placa"
          className={`${SELECT} w-64`}
          aria-label="Buscar"
        />
        <select name="veiculo" defaultValue={f.veiculo} className={SELECT} aria-label="Veículo">
          <option value="">Todos os veículos</option>
          <option value="sem">Sem veículo identificado</option>
          {veiculos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.rotulo}
            </option>
          ))}
        </select>
        <select name="condutor" defaultValue={f.condutor} className={SELECT} aria-label="Condutor">
          <option value="">Todos os condutores</option>
          <option value="sem">Sem condutor</option>
          {condutores.map((c) => (
            <option key={c.id} value={c.id}>
              {c.rotulo}
            </option>
          ))}
        </select>
        <label className="text-muted-foreground grid gap-0.5 text-xs">
          De
          <input type="date" name="de" defaultValue={f.de} className={SELECT} />
        </label>
        <label className="text-muted-foreground grid gap-0.5 text-xs">
          Até
          <input type="date" name="ate" defaultValue={f.ate} className={SELECT} />
        </label>
        {f.ordem !== "data" && <input type="hidden" name="ordem" value={f.ordem} />}
        {f.dir !== "desc" && <input type="hidden" name="dir" value={f.dir} />}
        {f.porPagina !== PADRAO_POR_PAGINA && <input type="hidden" name="porPagina" value={f.porPagina} />}
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
        {filtrando && (
          <Button variant="ghost" asChild>
            <Link href={BASE}>Limpar</Link>
          </Button>
        )}
      </form>

      <Card>
        <CardContent>
          {lista.linhas.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-sm">
              <Fuel className="size-6" />
              {filtrando ? "Nenhum abastecimento no filtro." : "Nenhum abastecimento lançado."}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <Ordenavel f={f} campo="data">Data</Ordenavel>
                  <TableHead>Veículo</TableHead>
                  <Ordenavel f={f} campo="posto">Posto</Ordenavel>
                  <TableHead className="hidden lg:table-cell">Combustível</TableHead>
                  <Ordenavel f={f} campo="litros" className="text-right">Litros</Ordenavel>
                  <Ordenavel f={f} campo="valor" className="text-right">Valor</Ordenavel>
                  <Ordenavel f={f} campo="hodometro" className="hidden text-right md:table-cell">Km</Ordenavel>
                  <TableHead>Condutor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.linhas.map((a) => (
                  <TableRow key={a.id} className="relative">
                    <TableCell className="whitespace-nowrap">
                      <Link href={`${BASE}/${a.id}`} className="text-primary hover:underline after:absolute after:inset-0">
                        {formatarDataHora(a.data_hora)}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {a.veiculoPlaca ?? (
                        <Badge variant="outline" className="border-warning/50 text-warning-fg">
                          {a.placaInformada ? `${a.placaInformada} · não identificado` : a.legado ? "Legado s/ veículo" : "Sem veículo"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-52">
                      <span className="line-clamp-1">
                        {a.posto ?? "—"}
                        {a.cidade ? ` · ${a.cidade}` : ""}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">{a.combustivel ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {a.volume?.toLocaleString("pt-BR") ?? "—"}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">{formatarMoeda(a.valor)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {a.hodometro?.toLocaleString("pt-BR") ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-48">
                      {a.usuarioNome ?? (
                        <span className="text-muted-foreground line-clamp-1 italic">
                          {a.condutorInformado ? `${a.condutorInformado} (não identificado)` : "—"}
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div className="mt-4">
            <Paginacao
              total={lista.total}
              pagina={lista.pagina}
              totalPaginas={lista.totalPaginas}
              porPagina={paginacao.porPagina}
              padrao={PADRAO_POR_PAGINA}
            />
          </div>
        </CardContent>
      </Card>
    </>
  )
}
