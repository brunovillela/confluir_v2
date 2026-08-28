import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ArrowRight, PackageCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import {
  listarFilaComprador,
  type ItemFilaComprador,
} from "@/lib/db/compras"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = { title: "Área do comprador — Confluir" }

const ETAPAS = [
  {
    chave: "solicitada",
    titulo: "Solicitadas",
    descricao: "Aguardando o comprador abrir a cotação",
    acao: "Iniciar cotação",
  },
  {
    chave: "em_cotacao",
    titulo: "Em cotação",
    descricao: "Coletando propostas dos fornecedores",
    acao: "Ver cotação",
  },
  {
    chave: "cotada",
    titulo: "Cotadas — a comprar",
    descricao: "Cotação encerrada, aguardando a compra",
    acao: "Escolher e comprar",
  },
] as const

function hoje(): string {
  return new Date().toISOString().slice(0, 10)
}

function ItemProcesso({
  item,
  acao,
}: {
  item: ItemFilaComprador
  acao: string
}) {
  const atrasado = item.data_limite ? item.data_limite < hoje() : false
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">
          <Link
            href={`/painel/compras/${item.id}`}
            className="text-primary tabular-nums hover:underline"
          >
            {item.codigo ?? "(sem código)"}
          </Link>
          {item.produto && (
            <span className="text-foreground"> — {item.produto}</span>
          )}
        </p>
        <p className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 text-xs">
          {item.departamentoNome && <span>{item.departamentoNome}</span>}
          {item.data_limite ? (
            <span className={atrasado ? "text-destructive font-medium" : ""}>
              {atrasado ? "prazo vencido em " : "receber até "}
              {formatarData(item.data_limite)}
            </span>
          ) : (
            <span>sem prazo</span>
          )}
        </p>
      </div>
      <Button variant="outline" size="sm" asChild>
        <Link href={`/painel/compras/${item.id}`}>
          {acao}
          <ArrowRight />
        </Link>
      </Button>
    </div>
  )
}

export default async function CompradorPage() {
  await requirePermissao("aquisicoes_comprador", ["aquisicoes_compras_edicao"])
  const { disponivel, itens } = await listarFilaComprador()

  const porEtapa = (chave: string) =>
    itens.filter((i) => i.situacao === chave)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/compras">
            <ArrowLeft />
            Compras
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Área do comprador
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Processos Via Compras que aguardam sua ação, da solicitação à compra.
        </p>
      </div>

      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            Rode <code>supabase/compras.sql</code> no Supabase para habilitar os
            processos de compra.
          </AlertDescription>
        </Alert>
      )}

      {disponivel && itens.length === 0 && (
        <Card>
          <CardContent>
            <p className="text-muted-foreground py-8 text-center text-sm">
              <PackageCheck className="mx-auto mb-2 size-5" />
              Nada na fila — nenhum processo Via Compras aguardando ação.
            </p>
          </CardContent>
        </Card>
      )}

      {ETAPAS.map((etapa) => {
        const lista = porEtapa(etapa.chave)
        if (lista.length === 0) return null
        return (
          <Card key={etapa.chave}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">{etapa.titulo}</CardTitle>
                  <CardDescription>{etapa.descricao}</CardDescription>
                </div>
                <Badge variant="secondary" className="tabular-nums">
                  {lista.length}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-2">
              {lista.map((item) => (
                <ItemProcesso key={item.id} item={item} acao={etapa.acao} />
              ))}
            </CardContent>
          </Card>
        )
      })}
    </>
  )
}
