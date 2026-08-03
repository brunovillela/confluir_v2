import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Building2, Plus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { formatarCnpjCpf } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

export const metadata: Metadata = { title: "Empregadores — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export default async function FontesPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string; excluida?: string; tipo?: string; situacao?: string }>
}) {
  const sessao = await requirePermissao("empregadores")
  const podeEditar = podeAcessar(sessao.permissoes, "empregadores")

  const params = await searchParams
  const { salvo, excluida } = params
  const tipo = ["empregador", "fundo"].includes(params.tipo ?? "")
    ? (params.tipo as string)
    : "todos"
  const situacao = ["ativas", "inativas"].includes(params.situacao ?? "")
    ? (params.situacao as string)
    : "todas"

  const todasFontes = await listarFontesPagadoras()
  const fontes = todasFontes.filter((f) => {
    if (tipo === "fundo" && f.fundo_pensao !== true) return false
    if (tipo === "empregador" && f.fundo_pensao === true) return false
    if (situacao === "ativas" && f.inativa === true) return false
    if (situacao === "inativas" && f.inativa !== true) return false
    return true
  })

  return (
    <>
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
              {fontes.length} fonte{fontes.length === 1 ? "" : "s"} —
              empregadores e fundos de pensão que pagam os filiados
            </p>
          </div>
          {podeEditar && (
            <Button asChild>
              <Link href="/painel/representacao/empregadores/nova">
                <Plus />
                Nova fonte
              </Link>
            </Button>
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

      <form method="GET" className="flex flex-wrap items-center gap-2">
        <select
          name="tipo"
          defaultValue={tipo}
          aria-label="Filtrar por tipo"
          className={SELECT_FILTRO}
        >
          <option value="todos">Todos os tipos</option>
          <option value="empregador">Empregadores</option>
          <option value="fundo">Fundos de pensão</option>
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
      </form>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Nome</TableHead>
              <TableHead className="hidden md:table-cell">CNPJ / CPF</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead className="text-right">Filiados ativos</TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fontes.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-40">
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                    <Building2 className="size-6" />
                    <p className="text-sm">Nenhuma fonte pagadora encontrada.</p>
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
                    {f.fundo_pensao === true ? "Fundo de pensão" : "Empregador"}
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
    </>
  )
}
