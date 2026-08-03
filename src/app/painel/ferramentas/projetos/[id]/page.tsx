import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Pencil } from "lucide-react"

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
import { obterProjeto } from "@/lib/db/projetos"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { ProjetoAcoes } from "./projeto-acoes"

export const metadata: Metadata = { title: "Projeto — Confluir" }

export default async function ProjetoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  const sessao = await requirePermissao("ferramentas_projetos", [
    "ferramentas_projetos_edicao",
  ])
  const editor = podeAcessar(sessao.permissoes, "ferramentas_projetos_edicao")
  const { id } = await params
  const { salvo } = await searchParams

  const projeto = await obterProjeto(id)
  if (!projeto) notFound()

  const saldo =
    projeto.orcamento != null ? projeto.orcamento - projeto.gastoCompras : null

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/ferramentas/projetos">
            <ArrowLeft />
            Projetos
          </Link>
        </Button>
        {editor && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/painel/ferramentas/projetos/${id}/editar`}>
              <Pencil />
              Editar
            </Link>
          </Button>
        )}
      </div>

      {salvo && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Projeto salvo com sucesso.</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {projeto.titulo ?? "(sem título)"}
            </h1>
            {projeto.finalizado ? (
              <Badge variant="outline" className="text-muted-foreground">
                Finalizado
              </Badge>
            ) : (
              <Badge variant="outline" className="border-success/40 text-success-fg">
                Em andamento
              </Badge>
            )}
            {projeto.estrategico && <Badge variant="secondary">Estratégico</Badge>}
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {projeto.tipo ?? "—"}
            {projeto.inicio || projeto.termino_previsao
              ? ` · ${projeto.inicio ? formatarData(projeto.inicio) : "?"}${
                  projeto.termino_previsao
                    ? ` – ${formatarData(projeto.termino_previsao)}`
                    : ""
                }`
              : ""}
          </p>
        </div>
        {editor && (
          <ProjetoAcoes projetoId={id} finalizado={projeto.finalizado === true} />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CardValor
          rotulo="Orçamento"
          valor={projeto.orcamento != null ? formatarMoeda(projeto.orcamento) : "—"}
        />
        <CardValor
          rotulo="Solicitado em Compras"
          valor={formatarMoeda(projeto.gastoCompras)}
        />
        <CardValor
          rotulo="Saldo do orçamento"
          valor={saldo != null ? formatarMoeda(saldo) : "—"}
          alerta={saldo != null && saldo < 0}
        />
        <CardValor rotulo="Solicitações" valor={projeto.solicitacoes.length} />
      </div>

      {(projeto.centroCustoNome || projeto.departamentos.length > 0) && (
        <Card>
          <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
            {projeto.centroCustoNome && (
              <div>
                <p className="text-muted-foreground text-xs">Centro de custo</p>
                <p className="mt-0.5">{projeto.centroCustoNome}</p>
              </div>
            )}
            {projeto.departamentos.length > 0 && (
              <div>
                <p className="text-muted-foreground text-xs">Departamentos</p>
                <p className="mt-0.5">{projeto.departamentos.join(", ")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {projeto.detalhamento && (
        <Card>
          <CardContent>
            <p className="text-muted-foreground mb-2 text-xs">Detalhamento</p>
            <p className="text-sm whitespace-pre-wrap">{projeto.detalhamento}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <p className="mb-3 text-sm font-medium">Solicitações de compra vinculadas</p>
          {projeto.solicitacoes.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhuma solicitação de compra vinculada a este projeto.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Objeto</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projeto.solicitacoes.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap">
                      <Link
                        href={`/painel/compras/${s.id}`}
                        className="text-primary font-medium hover:underline"
                      >
                        {s.codigo ?? "—"}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-80">
                      <span className="line-clamp-1">{s.descricao ?? "—"}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {s.situacao ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {s.valor != null ? formatarMoeda(s.valor) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function CardValor({
  rotulo,
  valor,
  alerta,
}: {
  rotulo: string
  valor: number | string
  alerta?: boolean
}) {
  return (
    <Card>
      <CardContent>
        <p className="text-muted-foreground text-xs">{rotulo}</p>
        <p
          className={`mt-1 text-2xl font-semibold tabular-nums ${
            alerta ? "text-destructive" : ""
          }`}
        >
          {typeof valor === "number" ? valor.toLocaleString("pt-BR") : valor}
        </p>
      </CardContent>
    </Card>
  )
}
