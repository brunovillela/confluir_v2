import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { SituacaoReembolsoBadge } from "@/components/reembolsos"
import { requirePermissao } from "@/lib/auth"
import { urlArquivoPessoal } from "@/lib/db/pessoal"
import { buscarReembolso, listarTiposReembolso } from "@/lib/db/reembolsos"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"

import { AvaliacaoReembolsoForm, MarcarPagoBotao } from "./avaliacao-form"

export const metadata: Metadata = {
  title: "Solicitação de reembolso — Confluir",
}

function valorTexto(v: number | null): string {
  if (v === null) return ""
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function Campo({
  rotulo,
  children,
  colSpan,
}: {
  rotulo: string
  children: React.ReactNode
  colSpan?: boolean
}) {
  return (
    <div className={colSpan ? "sm:col-span-2" : undefined}>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  )
}

export default async function ReembolsoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("pessoal_gestao")

  const { id } = await params
  const { salvo } = await searchParams
  const reembolso = await buscarReembolso(id)
  if (!reembolso) notFound()

  const { tipos } = await listarTiposReembolso()
  const tipo = tipos.find((t) => t.id === reembolso.tipo_id) ?? null
  const comprovante = await urlArquivoPessoal(reembolso.comprovante_url)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/reembolsos">
            <ArrowLeft />
            Reembolsos do ACT
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Solicitação de reembolso
          </h1>
          <SituacaoReembolsoBadge situacao={reembolso.situacao} />
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {reembolso.funcionarioNome ?? "(sem nome)"} · solicitada em{" "}
          {formatarDataHora(reembolso.created_at)}
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Avaliação registrada — o funcionário foi notificado.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da solicitação</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Funcionário">
              {reembolso.funcionario_id ? (
                <Link
                  href={`/painel/pessoal/${reembolso.funcionario_id}`}
                  className="hover:underline"
                >
                  {reembolso.funcionarioNome ?? "(sem nome)"}
                </Link>
              ) : (
                "—"
              )}
            </Campo>
            <Campo rotulo="Tipo (ACT)">
              {reembolso.tipoNome ?? "—"}
              {tipo?.valor_limite != null && (
                <span className="text-muted-foreground">
                  {" "}
                  · teto {formatarMoeda(tipo.valor_limite)}
                </span>
              )}
            </Campo>
            <Campo rotulo="Valor solicitado">
              <span className="font-medium">
                {formatarMoeda(reembolso.valor_solicitado)}
              </span>
            </Campo>
            <Campo rotulo="Comprovante">
              {comprovante ? (
                <a
                  href={comprovante}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary inline-flex items-center gap-1 hover:underline"
                >
                  Abrir <ExternalLink className="size-3.5" />
                </a>
              ) : (
                "—"
              )}
            </Campo>
            <Campo rotulo="Descrição" colSpan>
              <span className="whitespace-pre-wrap">
                {reembolso.descricao ?? "—"}
              </span>
            </Campo>
          </dl>
        </CardContent>
      </Card>

      {reembolso.situacao === "aguardando" ? (
        <AvaliacaoReembolsoForm
          reembolsoId={reembolso.id}
          valorSolicitadoTexto={valorTexto(reembolso.valor_solicitado)}
          tetoTexto={
            tipo?.valor_limite != null
              ? formatarMoeda(tipo.valor_limite)
              : null
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Avaliação e pagamento</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Avaliador">
                {reembolso.avaliadorNome ?? "—"}
              </Campo>
              <Campo rotulo="Avaliada em">
                {formatarDataHora(reembolso.avaliacao_data)}
              </Campo>
              <Campo rotulo="Valor aprovado">
                <span className="font-medium">
                  {formatarMoeda(reembolso.valor_aprovado)}
                </span>
              </Campo>
              <Campo rotulo="Contracheque de referência">
                {[reembolso.pagamento_mes, reembolso.pagamento_ano]
                  .filter(Boolean)
                  .join("/") || "A definir"}
              </Campo>
              {reembolso.avaliacao_observacao && (
                <Campo rotulo="Observação" colSpan>
                  <span className="whitespace-pre-wrap">
                    {reembolso.avaliacao_observacao}
                  </span>
                </Campo>
              )}
              {reembolso.pago_em && (
                <Campo rotulo="Pago em">
                  {formatarData(reembolso.pago_em)}
                </Campo>
              )}
            </dl>

            {reembolso.situacao === "aprovado" && (
              <MarcarPagoBotao reembolsoId={reembolso.id} />
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
