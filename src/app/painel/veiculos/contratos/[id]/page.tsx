import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink } from "lucide-react"

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
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requirePermissao } from "@/lib/auth"
import { buscarContrato, urlArquivoVeiculos } from "@/lib/db/veiculos"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { FinalizarContratoForm, GerarOrdemAluguelForm } from "../contrato-forms"

export const metadata: Metadata = { title: "Contrato de aluguel — Confluir" }

export default async function ContratoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("veiculos_gestao")
  const { id } = await params
  const { salvo } = await searchParams

  const contrato = await buscarContrato(id)
  if (!contrato) notFound()

  const arquivoUrl = await urlArquivoVeiculos(contrato.arquivo_contrato_url)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/veiculos/contratos">
            <ArrowLeft />
            Contratos de aluguel
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
              Contrato {contrato.numero ?? "(sem número)"}
              {contrato.finalizado ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Finalizado
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-success/40 text-success-fg"
                >
                  Vigente
                </Badge>
              )}
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {contrato.fornecedorNome ?? "locadora não informada"} ·{" "}
              {formatarData(contrato.vigencia_inicio)} →{" "}
              {formatarData(contrato.vigencia_termino)}
              {contrato.responsavelNome
                ? ` · responsável: ${contrato.responsavelNome}`
                : ""}
            </p>
            {contrato.finalidade && (
              <p className="text-muted-foreground mt-1 text-xs">
                <span className="text-foreground font-medium">Finalidade:</span>{" "}
                {contrato.finalidade}
              </p>
            )}
          </div>
          {!contrato.finalizado && (
            <FinalizarContratoForm contratoId={contrato.id} />
          )}
        </div>
      </div>

      {salvo && (
        <Alert variant="success">
          <AlertDescription>Registro salvo.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="grid gap-2 text-sm">
            <p className="font-medium">Veículos vinculados</p>
            {contrato.veiculos.length === 0 ? (
              <p className="text-muted-foreground">
                Nenhum veículo vinculado — faça o vínculo na ficha do veículo.
              </p>
            ) : (
              contrato.veiculos.map((v) => (
                <Link
                  key={v.id}
                  href={`/painel/veiculos/${v.id}`}
                  className="text-primary hover:underline"
                >
                  {v.placa ?? "s/ placa"} — {v.marca_modelo ?? ""}
                </Link>
              ))
            )}
            {arquivoUrl && (
              <a
                href={arquivoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary mt-2 flex items-center gap-1.5 hover:underline"
              >
                <ExternalLink className="size-3.5" />
                Contrato assinado
              </a>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-2 text-sm">
            <p className="font-medium">Mensalidade</p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatarMoeda(contrato.valor_mensal)}
            </p>
            {!contrato.finalizado && (
              <GerarOrdemAluguelForm
                contratoId={contrato.id}
                valorPadrao={
                  contrato.valor_mensal?.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  }) ?? ""
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      <GrupoColapsavel
        titulo="Ordens de pagamento do contrato"
        descricao="Mensalidades geradas aqui e ordens legadas vinculadas pelo backfill"
        resumo={
          <span className="text-muted-foreground text-sm tabular-nums">
            {contrato.ordens.length}
          </span>
        }
        aberto
      >
        {contrato.ordens.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhuma ordem vinculada a este contrato.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Situação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {contrato.ordens.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    {o.codigo ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-80">
                    <span className="line-clamp-1">{o.descricao ?? "—"}</span>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatarMoeda(o.valor)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatarData(o.vencimento)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {o.situacao ?? "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </GrupoColapsavel>
    </>
  )
}
