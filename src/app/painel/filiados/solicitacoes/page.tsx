import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Badge } from "@/components/ui/badge"
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
import { Paginacao } from "@/components/paginacao"
import { requirePermissao } from "@/lib/auth"
import {
  listarSolicitacoes,
  ROTULO_SITUACAO_SOLICITACAO,
  SITUACOES_FILA_FILTRO,
  type SituacaoSolicitacao,
} from "@/lib/db/filiacao-publica"
import { formatarData } from "@/lib/formato"
import { mascaraCpf } from "@/lib/mascaras"

export const metadata: Metadata = {
  title: "Fichas de filiação — Confluir",
}

const VARIANTE: Record<SituacaoSolicitacao, "secondary" | "outline"> = {
  aguardando_verificacao: "outline",
  aguardando_assinatura: "outline",
  nao_avaliada: "secondary",
  aprovada: "secondary",
  reprovada: "outline",
  desistente: "outline",
}

export default async function SolicitacoesFiliacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ situacao?: string; busca?: string; pagina?: string }>
}) {
  await requirePermissao("filiacao_gestao")

  const brutos = await searchParams
  const situacao = (
    SITUACOES_FILA_FILTRO as readonly string[]
  ).includes(brutos.situacao ?? "")
    ? (brutos.situacao as SituacaoSolicitacao)
    : "todas"
  const busca = (brutos.busca ?? "").trim()
  const pagina = Math.max(1, Number(brutos.pagina) || 1)

  const lista = await listarSolicitacoes({ situacao, busca, pagina })
  const aqui = "/painel/filiados/solicitacoes"

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/filiados">
            <ArrowLeft />
            Filiados
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Fichas de filiação
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Solicitações vindas da ficha pública. {lista.pendentes} aguardando
          avaliação.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Fila de avaliação</CardTitle>
          <CardDescription>
            {lista.total.toLocaleString("pt-BR")}
            {situacao !== "todas" && (
              <> · {ROTULO_SITUACAO_SOLICITACAO[situacao]}</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="mb-4 flex flex-wrap items-center gap-2" action={aqui}>
            <input
              type="search"
              name="busca"
              defaultValue={busca}
              placeholder="Nome, CPF ou matrícula"
              className="border-input bg-background h-9 w-64 max-w-full rounded-md border px-3 text-sm shadow-xs outline-none"
            />
            <select
              name="situacao"
              defaultValue={situacao}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
            >
              <option value="todas">Todas as situações</option>
              {SITUACOES_FILA_FILTRO.map((s) => (
                <option key={s} value={s}>
                  {ROTULO_SITUACAO_SOLICITACAO[s]}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline" size="sm">
              Filtrar
            </Button>
          </form>

          {lista.linhas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              Nenhuma ficha com esses filtros.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Prot.</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>Empregador</TableHead>
                    <TableHead>Enviada</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.linhas.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {o.protocolo ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-64">
                        <Link
                          href={`${aqui}/${o.id}`}
                          className="text-primary line-clamp-1 hover:underline"
                        >
                          {o.nome ?? "(sem nome)"}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {o.cpf ? mascaraCpf(o.cpf) : "—"}
                      </TableCell>
                      <TableCell className="max-w-40">
                        <span className="line-clamp-1">
                          {o.empregadorNome ?? "—"}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatarData(o.created_at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={VARIANTE[o.situacao]}
                          className="whitespace-nowrap"
                        >
                          {ROTULO_SITUACAO_SOLICITACAO[o.situacao]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <div className="mt-4">
            <Paginacao
              total={lista.total}
              pagina={lista.pagina}
              totalPaginas={lista.totalPaginas}
              porPagina={50}
              padrao={50}
            />
          </div>
        </CardContent>
      </Card>
    </>
  )
}
