import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, BedDouble, ExternalLink, FileText, Plane } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { urlArquivoCompras } from "@/lib/db/compras"
import { buscarFatura } from "@/lib/db/viagens-faturas"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { DesfazerFatura } from "./desfazer"

export const metadata: Metadata = { title: "Fatura de viagens — Confluir" }

export default async function FaturaViagensPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("viagens_gestao")
  const [{ id }, { salvo }] = await Promise.all([params, searchParams])
  const achada = await buscarFatura(id)
  if (!achada) notFound()
  const { fatura, itens, rateio } = achada
  const urlPdf = await urlArquivoCompras(fatura.arquivo)
  const podeDesfazer = !fatura.ordemSituacao || fatura.ordemSituacao === "Em autorização"

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/painel/viagens/faturas">
            <ArrowLeft />
            Faturas
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Fatura {fatura.numero}</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {fatura.fornecedorNome ?? "Agência"} · emitida em {formatarData(fatura.emissao)}
        </p>
      </div>

      {salvo === "1" && (
        <Alert variant="success">
          <AlertDescription>
            Fatura lançada — a ordem de pagamento{" "}
            {fatura.ordemCodigo ? <strong>{fatura.ordemCodigo}</strong> : ""} está em autorização.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Resumo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo="Itens" valor={formatarMoeda(fatura.valorItens)} />
            <Campo rotulo="Taxa da agência" valor={formatarMoeda(fatura.valorTaxas)} />
            <Campo rotulo="Total" valor={formatarMoeda(fatura.valorTotal)} forte />
            <Campo
              rotulo="Vencimento"
              valor={fatura.vencimento ? formatarData(fatura.vencimento) : null}
            />
            <Campo rotulo="Forma de pagamento" valor={fatura.formaPagamento} />
            <Campo rotulo="Departamento da compra" valor={fatura.departamentoNome} />
            <Campo rotulo="Observação" valor={fatura.observacao} />
          </dl>
          <div className="flex flex-wrap gap-2">
            {urlPdf && (
              <Button asChild variant="outline" size="sm">
                <a href={urlPdf} target="_blank" rel="noreferrer">
                  <FileText />
                  PDF da fatura
                </a>
              </Button>
            )}
            {fatura.ordemId && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/painel/financeiro/ordens/${fatura.ordemId}`}>
                  <ExternalLink />
                  Ordem {fatura.ordemCodigo ?? ""} — {fatura.ordemSituacao ?? "—"}
                </Link>
              </Button>
            )}
            {fatura.processoId && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/painel/compras/${fatura.processoId}`}>
                  <ExternalLink />
                  Compra {fatura.processoCodigo ?? ""}
                </Link>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Itens cobrados</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Viagem</TableHead>
                  <TableHead className="hidden md:table-cell">Conta</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {itens.map((i) => (
                  <TableRow key={i.itemId}>
                    <TableCell className="whitespace-normal">
                      <span className="flex items-center gap-1.5">
                        {i.tipo === "passagem" ? (
                          <Plane className="text-muted-foreground size-3.5 shrink-0" />
                        ) : (
                          <BedDouble className="text-muted-foreground size-3.5 shrink-0" />
                        )}
                        {i.descricao}
                      </span>
                      {i.localizador && (
                        <span className="text-muted-foreground text-xs">loc. {i.localizador}</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-normal">
                      <Link href={`/painel/viagens/${i.viagemId}`} className="hover:text-primary">
                        nº {i.viagemNumero ?? "—"} · {i.beneficiarioNome}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden whitespace-normal md:table-cell">
                      {i.centroCustoNome ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {i.valor !== null ? formatarMoeda(i.valor) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {rateio.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rateio da ordem</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {rateio.map((r) => (
                <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                  <span>
                    {r.centroCustoNome ?? "Sem conta"}
                    {r.departamentoNome && (
                      <span className="text-muted-foreground"> · {r.departamentoNome}</span>
                    )}
                    {r.descricao && (
                      <span className="text-muted-foreground block text-xs">{r.descricao}</span>
                    )}
                  </span>
                  <span className="tabular-nums">{formatarMoeda(r.valor)}</span>
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground mt-2 text-xs">
              A taxa da agência entra em cada conta na proporção dos itens.
            </p>
          </CardContent>
        </Card>
      )}

      {podeDesfazer && <DesfazerFatura id={fatura.id} />}
    </>
  )
}

function Campo({
  rotulo,
  valor,
  forte = false,
}: {
  rotulo: string
  valor: string | null
  forte?: boolean
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className={forte ? "text-base font-semibold" : undefined}>{valor ?? "—"}</dd>
    </div>
  )
}
