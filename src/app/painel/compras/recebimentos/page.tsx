import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, PackageCheck, PackageOpen } from "lucide-react"

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
import { listarRecebimentosPendentes } from "@/lib/db/compras"
import { hojeSP } from "@/lib/db/comum"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { RecebimentoForm } from "../[id]/processo-forms"

export const metadata: Metadata = { title: "Recebimentos — Confluir" }

export default async function RecebimentosComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("aquisicoes_recebimentos", [
    "aquisicoes_compras_edicao",
  ])
  const { salvo } = await searchParams
  const { disponivel, pendentes } = await listarRecebimentosPendentes()
  const hoje = hojeSP()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras">
            <ArrowLeft />
            Aquisição
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Recebimentos
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Compras que ainda vão chegar: aquisição direta não recebida e
          compras via Aquisição já feitas. Confira e registre a chegada.
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Recebimento registrado.</AlertDescription>
        </Alert>
      )}
      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            Rode <code>supabase/compras.sql</code> no Supabase para habilitar
            os fornecimentos.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            A receber ({pendentes.length})
          </CardTitle>
          <CardDescription>
            Ordenado pela previsão de entrega mais próxima. Clique na compra para registrar a chegada.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {pendentes.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              <PackageOpen className="mx-auto mb-2 size-5" />
              Nada aguardando chegada.
            </p>
          ) : (
            pendentes.map((f) => {
              const atrasado = !!f.previsao_entrega && f.previsao_entrega < hoje
              return (
                <details
                  key={f.id}
                  className="border-border group hover:border-primary/40 rounded-md border open:border-primary/40"
                >
                  <summary className="grid cursor-pointer list-none gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center [&::-webkit-details-marker]:hidden">
                    <div className="grid min-w-0 gap-1">
                      <p className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-sm font-medium">
                        <Link
                          href={`/painel/compras/${f.processo_id}`}
                          className="text-primary tabular-nums hover:underline"
                        >
                          {f.processoCodigo ?? "(sem código)"}
                        </Link>
                        {f.fornecedorNome && (
                          <span className="min-w-0 truncate">{f.fornecedorNome}</span>
                        )}
                      </p>
                      <p
                        className="text-muted-foreground line-clamp-2 text-xs break-words"
                        title={f.produto ?? undefined}
                      >
                        {f.produto ?? "—"}
                      </p>
                      <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        {f.departamentoNome && <span>{f.departamentoNome}</span>}
                        {f.data_compra && (
                          <span>Comprado em {formatarData(f.data_compra)}</span>
                        )}
                        {f.previsao_entrega ? (
                          <Badge variant={atrasado ? "warning" : "outline"}>
                            {atrasado ? "Atrasado · previsto para " : "Previsto para "}
                            {formatarData(f.previsao_entrega)}
                          </Badge>
                        ) : (
                          <span className="italic">Sem previsão de entrega</span>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-3 sm:flex-col sm:items-end sm:gap-1.5">
                      <span className="text-base font-semibold whitespace-nowrap tabular-nums">
                        {formatarMoeda(f.valor)}
                      </span>
                      <span className="text-primary border-primary/40 inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs font-medium whitespace-nowrap group-open:hidden">
                        <PackageCheck className="size-3.5" />
                        Registrar chegada
                      </span>
                      <span className="text-muted-foreground hidden text-xs group-open:inline">
                        Fechar
                      </span>
                    </div>
                  </summary>
                  <div className="border-border mx-3 mb-3 border-t pt-3">
                    <RecebimentoForm processoId="" fornecimentoId={f.id} />
                  </div>
                </details>
              )
            })
          )}
        </CardContent>
      </Card>
    </>
  )
}
