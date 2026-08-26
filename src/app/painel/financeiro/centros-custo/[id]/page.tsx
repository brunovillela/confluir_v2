import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Pencil, Receipt } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
  buscarCentroCusto,
  listarCentrosCusto,
  ordensDoCentroCusto,
  usoCentroCusto,
} from "@/lib/db/financeiro"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { SituacaoBadge } from "../../situacao-badge"
import { CentroCustoForm } from "../centro-form"

export const metadata: Metadata = { title: "Centro de custo — Confluir" }

export default async function CentroCustoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string; pagina?: string; editar?: string }>
}) {
  const sessao = await requirePermissao("financeiro_pagamento", [
    "financeiro_caixa",
    "financeiro_leitura",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "financeiro_pagamento", [
    "financeiro_caixa",
  ])

  const { id } = await params
  const sp = await searchParams
  const { salvo } = sp
  const editando = sp.editar === "1" && podeEditar
  const pagina = Math.max(1, Number(sp.pagina) || 1)
  const [centro, uso, todas, ordens] = await Promise.all([
    buscarCentroCusto(id),
    usoCentroCusto(id),
    listarCentrosCusto(),
    ordensDoCentroCusto(id, pagina),
  ])
  if (!centro) notFound()

  const tipos = [
    ...new Set(
      todas.map((c) => c.tipo_da_conta).filter((v): v is string => Boolean(v))
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"))

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/financeiro/centros-custo">
            <ArrowLeft />
            Centros de custo
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          {centro.nome_da_conta ?? "(sem nome)"}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Usado em {uso.ordens.toLocaleString("pt-BR")}{" "}
          {uso.ordens === 1 ? "ordem" : "ordens"} de pagamento e{" "}
          {uso.contratos.toLocaleString("pt-BR")} contrato
          {uso.contratos === 1 ? "" : "s"}
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Centro de custo salvo.</AlertDescription>
        </Alert>
      )}

      {editando ? (
        <CentroCustoForm centro={centro} tipos={tipos} podeEditar={podeEditar} />
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Dados da conta</CardTitle>
              {podeEditar && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/painel/financeiro/centros-custo/${id}?editar=1`}>
                    <Pencil />
                    Editar
                  </Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-muted-foreground text-xs">Nome da conta</dt>
                <dd className="font-medium">{centro.nome_da_conta ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">
                  Código de acesso
                </dt>
                <dd className="font-mono">{centro.acesso ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">
                  Classificador
                </dt>
                <dd className="font-mono">{centro.classificador ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">
                  Tipo da conta
                </dt>
                <dd>{centro.tipo_da_conta ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Conta usável</dt>
                <dd>
                  {centro.usavel === true
                    ? "Sim — aparece nas opções de lançamento"
                    : "Não"}
                </dd>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-muted-foreground text-xs">Indicações</dt>
                <dd className="whitespace-pre-wrap">
                  {centro.indicacoes ?? "—"}
                </dd>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-muted-foreground text-xs">
                  Contraindicações
                </dt>
                <dd className="whitespace-pre-wrap">
                  {centro.contraindicacoes ?? "—"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">
                Ordens de pagamento
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  {ordens.total.toLocaleString("pt-BR")} no total
                </span>
              </CardTitle>
              <CardDescription>
                Lançamentos com este centro de custo (despesa ou receita) —
                clique para ver o extrato da ordem
              </CardDescription>
            </div>
            <Receipt className="text-muted-foreground size-4" />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {ordens.linhas.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhuma ordem de pagamento neste centro de custo.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="hidden lg:table-cell">
                    Favorecido
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    Vencimento
                  </TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordens.linhas.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      <Link
                        href={`/painel/financeiro/ordens/${o.id}`}
                        className="hover:text-foreground hover:underline"
                      >
                        {o.codigo ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-64 font-medium">
                      <Link
                        href={`/painel/financeiro/ordens/${o.id}`}
                        className="hover:underline"
                      >
                        <span className="block truncate">
                          {o.descricao ?? "(sem descrição)"}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden max-w-44 truncate lg:table-cell">
                      {o.favorecido ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden whitespace-nowrap md:table-cell">
                      {formatarData(o.vencimento)}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatarMoeda(o.valor_pago ?? o.valor_inicial_cobranca)}
                    </TableCell>
                    <TableCell>
                      <SituacaoBadge situacao={o.situacao} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {ordens.totalPaginas > 1 && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-muted-foreground text-sm">
                Página {ordens.pagina} de {ordens.totalPaginas}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  disabled={ordens.pagina <= 1}
                >
                  {ordens.pagina > 1 ? (
                    <Link
                      href={`/painel/financeiro/centros-custo/${id}?pagina=${ordens.pagina - 1}`}
                    >
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
                  disabled={ordens.pagina >= ordens.totalPaginas}
                >
                  {ordens.pagina < ordens.totalPaginas ? (
                    <Link
                      href={`/painel/financeiro/centros-custo/${id}?pagina=${ordens.pagina + 1}`}
                    >
                      Próxima
                    </Link>
                  ) : (
                    <span>Próxima</span>
                  )}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
