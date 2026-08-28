import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, PackageOpen } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
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

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras">
            <ArrowLeft />
            Compras
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Recebimentos pendentes
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Compras que ainda vão chegar — aquisição direta não recebida e Via
          Compras já comprado; confira e registre a chegada
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
            Ordenado pela previsão de entrega mais próxima.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {pendentes.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              <PackageOpen className="mx-auto mb-2 size-5" />
              Nada aguardando chegada.
            </p>
          ) : (
            pendentes.map((f) => (
              <details
                key={f.id}
                className="border-border group rounded-md border p-3"
              >
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      <Link
                        href={`/painel/compras/${f.processo_id}`}
                        className="text-primary tabular-nums hover:underline"
                      >
                        {f.processoCodigo ?? "(sem código)"}
                      </Link>
                      {f.fornecedorNome && <> — {f.fornecedorNome}</>}
                    </p>
                    <p className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 text-xs">
                      <span className="truncate">{f.produto ?? "—"}</span>
                      {f.departamentoNome && <span>{f.departamentoNome}</span>}
                      {f.data_compra && (
                        <span>comprado em {formatarData(f.data_compra)}</span>
                      )}
                      <span>
                        {f.previsao_entrega
                          ? `previsto para ${formatarData(f.previsao_entrega)}`
                          : "sem previsão de entrega"}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold whitespace-nowrap tabular-nums">
                      {formatarMoeda(f.valor)}
                    </span>
                    <span className="text-primary text-xs group-open:hidden">
                      Registrar chegada
                    </span>
                  </div>
                </summary>
                <div className="border-border mt-3 border-t pt-3">
                  <RecebimentoForm processoId="" fornecimentoId={f.id} />
                </div>
              </details>
            ))
          )}
        </CardContent>
      </Card>
    </>
  )
}
