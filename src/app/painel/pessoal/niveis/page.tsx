import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Percent, Plus, Table2, TrendingUp } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { Paginacao } from "@/components/paginacao"
import { requirePermissao } from "@/lib/auth"
import {
  listarNiveisSalariais,
  rotuloNivelSalarial,
  TIPOS_AVANCO,
} from "@/lib/db/carreira"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Níveis salariais — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type ParamsLista = {
  salvo?: string
  excluido?: string
  busca?: string
  tipo?: string
  pagina?: string
  porPagina?: string
}

export default async function NiveisPage({
  searchParams,
}: {
  searchParams: Promise<ParamsLista>
}) {
  const sessao = await requirePermissao("pessoal_gestao", [
    "pessoal_niveis_salariais",
  ])
  // Reajuste mexe em todos os salários — só a gestão completa vê o atalho.
  const temGestao = podeAcessar(sessao.permissoes, "pessoal_gestao")

  const brutos = await searchParams
  const { salvo, excluido } = brutos
  const todos = await listarNiveisSalariais()

  const params = {
    busca: (brutos.busca ?? "").trim(),
    tipo: (TIPOS_AVANCO as readonly string[]).includes(brutos.tipo ?? "")
      ? brutos.tipo!
      : "todos",
  }

  const filtrados = todos.filter((n) => {
    if (
      params.busca &&
      !(n.funcionarioNome ?? "")
        .toLocaleLowerCase("pt-BR")
        .includes(params.busca.toLocaleLowerCase("pt-BR"))
    ) {
      return false
    }
    if (params.tipo !== "todos" && n.tipo_avanco !== params.tipo) return false
    return true
  })

  const paginacao = lerPaginacao(brutos, 30)
  const paginaAtual = paginar(filtrados, paginacao)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal">
            <ArrowLeft />
            Pessoal
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Níveis salariais
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {filtrados.length} lançamento{filtrados.length === 1 ? "" : "s"} —
              degraus do acordo coletivo que definem o salário básico por cargo
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {temGestao && (
              <Button variant="outline" asChild>
                <Link href="/painel/pessoal/niveis/reajuste">
                  <Percent />
                  Reajuste salarial
                </Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href="/painel/pessoal/niveis/tabela">
                <Table2 />
                Tabela salarial
              </Link>
            </Button>
            <Button asChild>
              <Link href="/painel/pessoal/niveis/novo">
                <Plus />
                Novo lançamento
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Lançamento salvo.</AlertDescription>
        </Alert>
      )}
      {excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Lançamento excluído.</AlertDescription>
        </Alert>
      )}

      <form method="GET" className="flex flex-wrap items-center gap-2">
        <Input
          name="busca"
          defaultValue={params.busca}
          placeholder="Nome do funcionário"
          className="h-9 w-full sm:max-w-56"
          aria-label="Buscar por funcionário"
        />
        <select
          name="tipo"
          defaultValue={params.tipo}
          aria-label="Filtrar por tipo de avanço"
          className={SELECT_FILTRO}
        >
          <option value="todos">Todos os tipos de avanço</option>
          {TIPOS_AVANCO.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="sm">
          Filtrar
        </Button>
      </form>

      <div className="overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Funcionário</TableHead>
                <TableHead>Nível</TableHead>
                <TableHead className="hidden lg:table-cell">Cargo</TableHead>
                <TableHead className="text-right">Salário básico</TableHead>
                <TableHead className="hidden md:table-cell">
                  Tipo de avanço
                </TableHead>
                <TableHead>Vale desde</TableHead>
                <TableHead className="hidden xl:table-cell">
                  Próximo nível
                </TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginaAtual.total === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-40">
                    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                      <TrendingUp className="size-6" />
                      <p className="text-sm">
                        Nenhum lançamento de nível salarial
                        {params.busca && <> para “{params.busca}”</>}.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {paginaAtual.linhas.map((n) => (
                <TableRow key={n.id}>
                  <TableCell className="max-w-56 font-medium">
                    {n.funcionario_id ? (
                      <Link
                        href={`/painel/pessoal/${n.funcionario_id}`}
                        className="hover:underline"
                      >
                        <span className="block truncate">
                          {n.funcionarioNome ?? "(sem nome)"}
                        </span>
                      </Link>
                    ) : (
                      "(sem funcionário)"
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {rotuloNivelSalarial(n.nivelAtual)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden max-w-48 truncate lg:table-cell">
                    {n.cargoNome ?? "—"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatarMoeda(n.nivelAtual?.salario_base)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden md:table-cell">
                    {n.tipo_avanco ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatarData(n.nivel_atual_data)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden whitespace-nowrap xl:table-cell">
                    {n.proximoNivel
                      ? `${rotuloNivelSalarial(n.proximoNivel)}${n.proximo_nivel_data ? ` em ${formatarData(n.proximo_nivel_data)}` : ""}`
                      : (n.proximo_nivel_texto ?? "—")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild className="h-7 px-2">
                      <Link href={`/painel/pessoal/niveis/${n.id}`}>Editar</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Paginacao
        total={paginaAtual.total}
        pagina={paginaAtual.pagina}
        totalPaginas={paginaAtual.totalPaginas}
        porPagina={paginacao.porPagina}
        padrao={30}
      />
    </>
  )
}
