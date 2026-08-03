import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowDown,
  ArrowUp,
  Download,
  Search,
  UsersRound,
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
import { formatarCpf } from "@/lib/cpf"
import {
  FILIADOS_POR_PAGINA,
  listarFiliados,
  type FiltrosFiliados,
} from "@/lib/db/filiados"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { FILIACAO_CONDICOES, GRUPOS_CONDICAO } from "@/lib/filiacao"
import { formatarData } from "@/lib/formato"
import { cn } from "@/lib/utils"

import { CondicaoBadge } from "../condicao-badge"

export const metadata: Metadata = { title: "Filiados — Confluir" }

type ParamsBusca = {
  busca?: string
  situacao?: string
  condicao?: string
  sexo?: string
  fonte?: string
  pagina?: string
  ordem?: string
  dir?: string
}

const CONDICOES_FILTRO = [
  ...FILIACAO_CONDICOES,
  "nenhuma",
  ...Object.keys(GRUPOS_CONDICAO),
] as const
const SEXOS_FILTRO = ["Masculino", "Feminino", "Outro", "nenhum"] as const
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normalizarFiltros(params: ParamsBusca): Required<FiltrosFiliados> {
  const situacoes = ["todas", "ativas", "excluidas"] as const
  const ordens = ["nome", "matricula", "cadastro"] as const
  return {
    busca: params.busca ?? "",
    situacao: situacoes.includes(params.situacao as never)
      ? (params.situacao as (typeof situacoes)[number])
      : "ativas",
    condicao: CONDICOES_FILTRO.includes(params.condicao as never)
      ? (params.condicao as string)
      : "todas",
    sexo: SEXOS_FILTRO.includes(params.sexo as never)
      ? (params.sexo as string)
      : "todos",
    fonte: UUID.test(params.fonte ?? "") ? (params.fonte as string) : "",
    pagina: Math.max(1, Number(params.pagina) || 1),
    ordem: ordens.includes(params.ordem as never)
      ? (params.ordem as (typeof ordens)[number])
      : "nome",
    dir: params.dir === "desc" ? "desc" : "asc",
  }
}

function montarUrl(
  filtros: Required<FiltrosFiliados>,
  mudancas: Partial<Record<keyof FiltrosFiliados, string | number>>
): string {
  const merged = { ...filtros, ...mudancas }
  const q = new URLSearchParams()
  if (merged.busca) q.set("busca", String(merged.busca))
  if (merged.situacao !== "ativas") q.set("situacao", String(merged.situacao))
  if (merged.condicao !== "todas") q.set("condicao", String(merged.condicao))
  if (merged.sexo !== "todos") q.set("sexo", String(merged.sexo))
  if (merged.fonte) q.set("fonte", String(merged.fonte))
  if (Number(merged.pagina) > 1) q.set("pagina", String(merged.pagina))
  if (merged.ordem !== "nome") q.set("ordem", String(merged.ordem))
  if (merged.dir !== "asc") q.set("dir", String(merged.dir))
  const query = q.toString()
  return `/painel/filiados/lista${query ? `?${query}` : ""}`
}

function CabecalhoOrdenavel({
  filtros,
  campo,
  children,
  className,
}: {
  filtros: Required<FiltrosFiliados>
  campo: "nome" | "matricula" | "cadastro"
  children: React.ReactNode
  className?: string
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

/**
 * Select nativo dos filtros. `color-scheme` explícito faz o Chromium desenhar
 * o popup no tema certo (sem ele, o dark mode abria popup claro com texto
 * claro — ilegível); bg/text-foreground cobrem o controle em si.
 */
const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const CHIPS_SITUACAO = [
  { valor: "ativas", rotulo: "Ativas" },
  { valor: "excluidas", rotulo: "Excluídas" },
  { valor: "todas", rotulo: "Todas" },
] as const

export default async function FiliadosPage({
  searchParams,
}: {
  searchParams: Promise<ParamsBusca>
}) {
  await requirePermissao("filiacao_filiados", [
    "filiacao_gestao",
    "filiacao_receitas",
  ])

  const filtros = normalizarFiltros(await searchParams)
  const [lista, fontes] = await Promise.all([
    listarFiliados(filtros),
    listarFontesPagadoras(),
  ])
  const nomeFonte = (id: string) => {
    const f = fontes.find((x) => x.id === id)
    return f ? (f.nome_fantasia ?? f.nome_razao ?? "(sem nome)") : null
  }

  const de = (lista.pagina - 1) * FILIADOS_POR_PAGINA + 1
  const ate = Math.min(lista.total, lista.pagina * FILIADOS_POR_PAGINA)

  const urlExportar = (() => {
    const q = new URLSearchParams()
    if (filtros.busca) q.set("busca", filtros.busca)
    q.set("situacao", filtros.situacao)
    if (filtros.condicao !== "todas") q.set("condicao", filtros.condicao)
    if (filtros.sexo !== "todos") q.set("sexo", filtros.sexo)
    if (filtros.fonte) q.set("fonte", filtros.fonte)
    return `/painel/filiados/exportar?${q.toString()}`
  })()

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Filiados</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {lista.total.toLocaleString("pt-BR")} registro
            {lista.total === 1 ? "" : "s"} de filiação
            {filtros.busca && <> para “{filtros.busca}”</>}
            {filtros.fonte && nomeFonte(filtros.fonte) && (
              <>
                {" "}
                · fonte:{" "}
                <Link
                  href={`/painel/representacao/empregadores/${filtros.fonte}`}
                  className="text-foreground underline-offset-2 hover:underline"
                >
                  {nomeFonte(filtros.fonte)}
                </Link>
              </>
            )}
            {filtros.sexo !== "todos" && (
              <>
                {" "}
                · sexo:{" "}
                {filtros.sexo === "nenhum" ? "não informado" : filtros.sexo}
              </>
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <a href={urlExportar} download>
            <Download />
            Exportar CSV
          </a>
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <form
          method="GET"
          className="flex min-w-0 flex-1 flex-wrap items-center gap-2"
        >
          {filtros.situacao !== "ativas" && (
            <input type="hidden" name="situacao" value={filtros.situacao} />
          )}
          {filtros.sexo !== "todos" && (
            <input type="hidden" name="sexo" value={filtros.sexo} />
          )}
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              name="busca"
              defaultValue={filtros.busca}
              placeholder="Nome, CPF ou matrícula"
              className="pl-8"
              aria-label="Buscar filiado"
            />
          </div>
          <select
            name="condicao"
            defaultValue={filtros.condicao}
            aria-label="Filtrar por condição"
            className={SELECT_FILTRO}
          >
            <option value="todas">Todas as condições</option>
            {FILIACAO_CONDICOES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="nenhuma">Sem condição</option>
            <optgroup label="Grupos">
              {Object.entries(GRUPOS_CONDICAO).map(([chave, g]) => (
                <option key={chave} value={chave}>
                  {g.rotulo}
                </option>
              ))}
            </optgroup>
          </select>
          <select
            name="fonte"
            defaultValue={filtros.fonte}
            aria-label="Filtrar por fonte pagadora"
            className={SELECT_FILTRO}
          >
            <option value="">Todas as fontes pagadoras</option>
            {fontes.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome_fantasia ?? f.nome_razao ?? "(sem nome)"}
              </option>
            ))}
          </select>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
        </form>

        <div className="flex items-center gap-1.5" role="group" aria-label="Filtrar por situação">
          {CHIPS_SITUACAO.map((chip) => (
            <Button
              key={chip.valor}
              variant={filtros.situacao === chip.valor ? "default" : "outline"}
              size="sm"
              asChild
            >
              <Link href={montarUrl(filtros, { situacao: chip.valor, pagina: 1 })}>
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
              <TableHead>CPF</TableHead>
              <CabecalhoOrdenavel filtros={filtros} campo="matricula">
                Matrícula
              </CabecalhoOrdenavel>
              <TableHead className="hidden md:table-cell">Lotação</TableHead>
              <TableHead>Condição</TableHead>
              <CabecalhoOrdenavel
                filtros={filtros}
                campo="cadastro"
                className="hidden lg:table-cell"
              >
                Cadastro
              </CabecalhoOrdenavel>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="h-40">
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                    <UsersRound className="size-6" />
                    <p className="text-sm">
                      Nenhum filiado encontrado
                      {filtros.busca && <> para “{filtros.busca}”</>}
                      .
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {lista.linhas.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="max-w-64 font-medium">
                  <Link
                    href={`/painel/filiados/${f.id}`}
                    className="hover:underline"
                  >
                    <span className="block truncate">
                      {f.nome_completo ?? "(sem nome)"}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {f.cpf ? formatarCpf(f.cpf) : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {f.matricula_sindical ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground hidden max-w-48 truncate md:table-cell">
                  {f.filiacao_lotacao ?? "—"}
                </TableCell>
                <TableCell>
                  {f.filiacao_excluida === true ? (
                    <Badge variant="outline" className="text-destructive border-destructive/40">
                      Excluída
                    </Badge>
                  ) : (
                    <CondicaoBadge condicao={f.filiacao_condicao} />
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground hidden lg:table-cell">
                  {formatarData(f.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-4">
        <p className="text-muted-foreground text-sm">
          {lista.total > 0 ? (
            <>
              Exibindo {de.toLocaleString("pt-BR")}–{ate.toLocaleString("pt-BR")}{" "}
              de {lista.total.toLocaleString("pt-BR")}
            </>
          ) : (
            "Nada a exibir"
          )}
        </p>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            asChild
            disabled={lista.pagina <= 1}
          >
            {lista.pagina > 1 ? (
              <Link href={montarUrl(filtros, { pagina: lista.pagina - 1 })}>
                Anterior
              </Link>
            ) : (
              <span>Anterior</span>
            )}
          </Button>
          <span className="text-muted-foreground text-sm tabular-nums">
            {lista.pagina} / {lista.totalPaginas}
          </span>
          <Button
            variant="outline"
            size="sm"
            asChild
            disabled={lista.pagina >= lista.totalPaginas}
          >
            {lista.pagina < lista.totalPaginas ? (
              <Link href={montarUrl(filtros, { pagina: lista.pagina + 1 })}>
                Próxima
              </Link>
            ) : (
              <span>Próxima</span>
            )}
          </Button>
        </div>
      </div>
    </>
  )
}
