import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Award, Plus, Table2 } from "lucide-react"

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
import { Paginacao } from "@/components/paginacao"
import { requirePermissao } from "@/lib/auth"
import { formatarAliquota, listarAnuenios } from "@/lib/db/carreira"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"

export const metadata: Metadata = { title: "Anuênios — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type ParamsLista = {
  salvo?: string
  excluido?: string
  busca?: string
  ano?: string
  contabilidade?: string
  pagina?: string
  porPagina?: string
}

export default async function AnueniosPage({
  searchParams,
}: {
  searchParams: Promise<ParamsLista>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_anuenios"])

  const brutos = await searchParams
  const { salvo, excluido } = brutos
  const todos = await listarAnuenios()

  const anos = [
    ...new Set(todos.map((a) => a.ano).filter((v): v is string => Boolean(v))),
  ].sort((a, b) => b.localeCompare(a))

  const params = {
    busca: (brutos.busca ?? "").trim(),
    ano: anos.includes(brutos.ano ?? "") ? brutos.ano! : "todos",
    contabilidade: ["informados", "pendentes"].includes(
      brutos.contabilidade ?? ""
    )
      ? brutos.contabilidade!
      : "todos",
  }

  const filtrados = todos.filter((a) => {
    if (
      params.busca &&
      !(a.funcionarioNome ?? "")
        .toLocaleLowerCase("pt-BR")
        .includes(params.busca.toLocaleLowerCase("pt-BR"))
    ) {
      return false
    }
    if (params.ano !== "todos" && a.ano !== params.ano) return false
    if (params.contabilidade === "informados" && a.informado_contabilidade !== true)
      return false
    if (params.contabilidade === "pendentes" && a.informado_contabilidade === true)
      return false
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
            <h1 className="text-2xl font-semibold tracking-tight">Anuênios</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {filtrados.length} lançamento{filtrados.length === 1 ? "" : "s"} —
              alíquota sobre o salário básico por ano de casa; avança no
              aniversário de emprego
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/painel/pessoal/anuenios/tabela">
                <Table2 />
                Tabela de alíquotas
              </Link>
            </Button>
            <Button asChild>
              <Link href="/painel/pessoal/anuenios/novo">
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
          name="ano"
          defaultValue={params.ano}
          aria-label="Filtrar por ano"
          className={SELECT_FILTRO}
        >
          <option value="todos">Todos os anos</option>
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          name="contabilidade"
          defaultValue={params.contabilidade}
          aria-label="Filtrar por contabilidade"
          className={SELECT_FILTRO}
        >
          <option value="todos">Contabilidade — todos</option>
          <option value="informados">Informados</option>
          <option value="pendentes">Pendentes</option>
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
                <TableHead className="hidden sm:table-cell">
                  Referência
                </TableHead>
                <TableHead className="text-right">Nível</TableHead>
                <TableHead className="text-right">Alíquota</TableHead>
                <TableHead>Vale desde</TableHead>
                <TableHead className="hidden md:table-cell">
                  Próximo nível
                </TableHead>
                <TableHead>Contabilidade</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginaAtual.total === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-40">
                    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                      <Award className="size-6" />
                      <p className="text-sm">
                        Nenhum lançamento de anuênio
                        {params.busca && <> para “{params.busca}”</>}.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {paginaAtual.linhas.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="max-w-56 font-medium">
                    {a.funcionario_id ? (
                      <Link
                        href={`/painel/pessoal/${a.funcionario_id}`}
                        className="hover:underline"
                      >
                        <span className="block truncate">
                          {a.funcionarioNome ?? "(sem nome)"}
                        </span>
                      </Link>
                    ) : (
                      "(sem funcionário)"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden whitespace-nowrap sm:table-cell">
                    {[a.mes, a.ano].filter(Boolean).join(" / ") || "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {a.nivelAtual?.nivel ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatarAliquota(a.nivelAtual?.aliquota)}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatarData(a.nivel_atual_data)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden whitespace-nowrap md:table-cell">
                    {a.proximoNivel
                      ? `Nível ${a.proximoNivel.nivel ?? "?"} em ${formatarData(a.proximo_nivel_data)}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {a.informado_contabilidade === true ? (
                      <Badge
                        variant="outline"
                        className="border-success/40 text-success-fg"
                      >
                        Informado
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-warning/40 text-warning-fg"
                      >
                        Pendente
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild className="h-7 px-2">
                      <Link href={`/painel/pessoal/anuenios/${a.id}`}>
                        Editar
                      </Link>
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
